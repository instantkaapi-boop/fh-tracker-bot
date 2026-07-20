import { notion } from './notion.js';

const DATA_SOURCE_ID = process.env.BRAND_DATA_SOURCE;

function plainTitle(prop) {
  return (prop?.title ?? []).map((t) => t.plain_text).join('').trim();
}

// Levin's checklist tasks not yet completed — the brief's working set.
export async function fetchOpenBrandTasks() {
  const rows = [];
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      filter: { property: 'Status', select: { does_not_equal: 'Completed' } },
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(
      ...res.results.map((page) => ({
        content: plainTitle(page.properties['Task']),
        status: page.properties['Status']?.select?.name ?? 'Not Started',
      })),
    );
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}
