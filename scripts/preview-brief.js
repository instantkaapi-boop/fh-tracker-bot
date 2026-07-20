import 'dotenv/config';
import { fetchOpenRows } from '../lib/notion.js';
import { formatBrief } from '../lib/format.js';

const rows = await fetchOpenRows();
console.log(formatBrief(rows));
