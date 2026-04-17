import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

export function readDataFile(name: string): unknown {
  try {
    const content = fs.readFileSync(path.join(DATA_DIR, name + '.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function writeDataFile(name: string, data: unknown): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, name + '.json'), JSON.stringify(data, null, 2));
  } catch {
    // Vercel serverless: filesystem is read-only in production
    // Data is stored in localStorage on the client side as fallback
  }
}
