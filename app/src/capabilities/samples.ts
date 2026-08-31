/**
 * Judge-alone path: client-generated sample files, so a reviewer with no test
 * data can exercise every primitive in one click. Everything is drawn on a
 * canvas at runtime — clearly watermarked SAMPLE, nothing fetched, nothing real.
 */

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('canvas export failed'));
      resolve(new File([blob], name, { type: 'image/png' }));
    }, 'image/png');
  });
}

function docCanvas(title: string, lines: string[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 820;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(title, 40, 70);
  ctx.font = '20px Courier New';
  lines.forEach((line, i) => ctx.fillText(line, 40, 130 + i * 34));
  // diagonal SAMPLE watermark
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-Math.PI / 5);
  ctx.font = 'bold 90px Arial';
  ctx.fillStyle = 'rgba(200, 40, 40, 0.18)';
  ctx.textAlign = 'center';
  ctx.fillText('SAMPLE', 0, 0);
  ctx.restore();
  return c;
}

function emojiCanvas(emoji: string, bg: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '300px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, c.width / 2, c.height / 2 + 20);
  ctx.font = '24px Arial';
  ctx.fillStyle = 'rgba(120,120,120,0.7)';
  ctx.fillText('SAMPLE', c.width / 2, c.height - 30);
  return c;
}

export async function generateSampleFiles(): Promise<File[]> {
  return Promise.all([
    canvasToFile(docCanvas('FABRIC DEMO BANK', [
      'ACCOUNT STATEMENT',
      'Account holder: A. Sample',
      'Period: 2026-07-01 to 2026-07-31',
      '',
      '2026-07-03  GROCERIES        -42.10',
      '2026-07-09  RENT           -1200.00',
      '2026-07-14  SALARY         +3400.00',
      '2026-07-21  UTILITIES        -96.55',
      '',
      'Closing balance:            2061.35',
      '',
      'This is a generated demo document.',
    ]), 'sample-bank-statement.png'),
    canvasToFile(docCanvas('CERTIFICATE OF DEMO', [
      'This certifies that the bearer',
      'successfully joined a Fabric room',
      'and shared exactly what they chose.',
      '',
      'Issued: 2026-08-28',
      'Registry no: FAB-0001',
      '',
      'This is a generated demo document.',
    ]), 'sample-certificate.png'),
    canvasToFile(emojiCanvas('🐕', '#f3f7e9'), 'sample-dog.png'),
    canvasToFile(emojiCanvas('🚗', '#e9f0f7'), 'sample-car.png'),
    canvasToFile(emojiCanvas('🍕', '#f7efe9'), 'sample-pizza.png'),
  ]);
}
