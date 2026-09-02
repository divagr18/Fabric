/// <reference types="@cloudflare/workers-types" />

/**
 * POST /api/plan — turns {goal, capability graph} into a Pipeline via OpenAI.
 * The browser never sees the API key; the validator on the host is the real gate,
 * this endpoint just has to produce plausible JSON (json_object mode + precise contract).
 */

export interface PlanEnv {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
}

const SYSTEM_PROMPT = `You are Fabric's execution planner. Fabric is a runtime where an agent's tools execute across a user's own browsers ("nodes"). You compose pipelines from a FIXED set of primitives — never invent methods, never write code.

You receive a capability graph: nodes (peerId, label, online, capabilities with the methods they expose) and a goal. Emit ONE JSON pipeline object, nothing else.

PIPELINE SHAPE:
{
  "toolName": "snake_case_name",            // 3-40 chars, describes the capability
  "description": "what this tool does, for the calling agent",
  "inputSchema": { "type": "object", "properties": { ... }, "required": [...] },
  "stages": [ { "id": "...", "node": "<peerId or 'host'>", "method": "...", "args": { ... }, "dependsOn": ["..."] } ],
  "output": { "fromStage": "<stage id>", "summary": "optional one-line framing" }
}

ARG VALUE REFERENCES:
- {"$input": "fieldName"} — a field of the tool call's input (must exist in inputSchema.properties)
- {"$from": "stageId", "path": "a.b.0"} — a prior stage's result (dot path, array indices allowed)

NODE PRIMITIVES (node = a peerId that exposes the method):
- data.list  args {"capId": string} → {"files": [{"id","name","mime","image"}]}
- data.read  args {"fileId": string} → the file itself; downstream sees {"name","mime","bytes"}
- compute.embed  args {"capId"?: string, "fileIds"?: [string], "limit"?: number} → {"items": [{"fileId","vector"}], "backend", "ms"}  (CLIP image embeddings of granted images, computed on that node)
- compute.embed_text  args {"texts": [string]} → {"vectors": [[number]]}  (CLIP text embeddings, same space as images)
- compute.ocr  args {"fileIds": [string]} → {"items": [{"fileId","text","confidence"}]}
- human.request  args {"kind": "capture"|"decide"|"approve", "prompt": string, "options"?: [string]} → capture: the photo {"name","mime","bytes"}; decide: {"kind","choice"}; approve: {"kind","approved"}  (a real person answers; prompt is shown to them)

HOST OPS (node = "host", run on the coordinating device):
- host.match  args {"query": vector, "items": <one stage's items, OR an array of $from refs to combine several stages' items, e.g. [{"$from":"a","path":"items"},{"$from":"b","path":"items"}]>, "topK"?: number} → {"matches": [{"score", ...item fields}]}
- host.pick  args {"value": <usually a $from ref>, "path"?: string, "match"?: {"field": string, "contains": string}, "limit"?: number, "fields"?: [string]} → {"items": [...]}  (selection/filter/projection glue — e.g. keep only files whose "name" contains "receipt")
- host.compile_pdf  args {"title": string, "parts": [<$from refs to read/captured files or {"name","text"}>]} → {"artifact", "pages", "bytes"}  (compiled locally, shown in the Fabric UI)

RULES:
1. Bind every node stage to a peerId from the graph that is online AND exposes that method. Use the peerId exactly, never the label.
2. Data gravity: run compute.embed / compute.ocr on the node that shares the data. Move vectors and text between devices, not files, unless the goal requires the file itself.
3. human.request is ONLY for what machines cannot do: physical-world actions (photograph a paper document), judgment calls between options, approvals. NEVER use it for search, similarity, matching, or extraction — compute primitives do those. Every human.request MUST have a specific, actionable "prompt" string; a person reads it.
4. Stages with no dependency between them run concurrently — only add dependsOn (or $from, which implies it) when truly needed.
5. Keep it minimal: no more than 10 stages, no stages the goal doesn't need.
6. Any "find/search/similar/matching images" goal means: compute.embed_text for the query text, compute.embed for each node's images, host.match to rank (CLIP vectors share one space). This is fully automatic — no human involved.
7. inputSchema must declare every {"$input"} field used. Prefer few, meaningful inputs.
8. Raw data never leaves the device network; there is no cloud. Do not invent upload/download/network methods.

If prior validation errors are provided, fix exactly those errors and change nothing else.

REPLAN MODE: if a FROZEN INTERFACE is provided, the tool already exists and its interface must not change. Output toolName and inputSchema EXACTLY as given (byte-for-byte). Produce a NEW stage graph using only the CURRENT capability graph — the old plan referenced devices or capabilities that are gone. Preserve the original approach on surviving nodes where possible; move work that was on lost nodes to nodes that still expose the needed methods.

Respond with ONLY the pipeline JSON object.`;

export async function handlePlan(request: Request, env: PlanEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!env.OPENAI_API_KEY) return json({ error: 'planner not configured (missing OPENAI_API_KEY secret)' }, 503);

  let body: {
    goal?: string;
    constraints?: unknown;
    graph?: unknown;
    existingTools?: string[];
    previousPipeline?: unknown;
    previousErrors?: string[];
    fixed?: { toolName: string; inputSchema: unknown };
  };
  try { body = await request.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.goal || !body.graph) return json({ error: 'goal and graph are required' }, 400);

  const user = [
    `CAPABILITY GRAPH:\n${JSON.stringify(body.graph, null, 2)}`,
    body.existingTools?.length ? `TOOL NAMES ALREADY TAKEN: ${body.existingTools.join(', ')}` : '',
    body.constraints ? `CONSTRAINTS: ${JSON.stringify(body.constraints)}` : '',
    body.fixed
      ? `FROZEN INTERFACE (replan mode — keep exactly):\ntoolName: ${body.fixed.toolName}\ninputSchema: ${JSON.stringify(body.fixed.inputSchema)}`
      : '',
    `GOAL: ${body.goal}`,
    body.previousErrors?.length
      ? `YOUR PREVIOUS ATTEMPT FAILED VALIDATION.\nPrevious pipeline:\n${JSON.stringify(body.previousPipeline)}\nErrors to fix:\n- ${body.previousErrors.join('\n- ')}`
      : '',
  ].filter(Boolean).join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL ?? 'gpt-5-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: `planner upstream ${res.status}`, detail: detail.slice(0, 500) }, 502);
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return json({ error: 'planner returned no content' }, 502);

  try {
    return json({ pipeline: JSON.parse(content) });
  } catch {
    return json({ error: 'planner returned unparseable JSON', detail: content.slice(0, 500) }, 502);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
