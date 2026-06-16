import fs from 'fs';
import path from 'path';
import ClientPage from './ClientPage';

export function generateStaticParams() {
  try {
    const dataPath = path.join(process.cwd(), 'public', 'data', 'all_scores.json');
    const content = fs.readFileSync(dataPath, 'utf-8');
    const data = JSON.parse(content);
    // data can be an array or { stocks: [] }
    const stocks = Array.isArray(data) ? data : data.stocks || data.all_stock_scores || [];
    return stocks.map((s: any) => ({
      code: s.stock_id,
    }));
  } catch (e) {
    console.error('Failed to parse all_scores.json for static paths', e);
    // fallback to at least generating one page just so the build passes
    return [{ code: '2330' }];
  }
}

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  return <ClientPage params={params} />;
}
