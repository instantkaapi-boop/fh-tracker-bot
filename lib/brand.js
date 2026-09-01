import { notion } from './notion.js';

const DATA_SOURCE_ID = process.env.BRAND_DATA_SOURCE;

function plainTitle(prop) {
  return (prop?.title ?? []).map((t) => t.plain_text).join('').trim();
}

// Add a task to Levin's Brand Manager Kanban — shows up in the brief's Levin
// section automatically (fetchOpenBrandTasks pulls everything not Completed).
export async function addBrandTask(content) {
  const page = await notion.pages.create({
    parent: { data_source_id: DATA_SOURCE_ID },
    properties: {
      Task: { title: [{ text: { content } }] },
      Status: { select: { name: 'Not Started' } },
    },
  });
  return { id: page.id, content };
}

// Levin's checklist tasks not yet completed — the brief's working set.
// Sorted oldest-first so the numbering shown in the brief is stable between
// the brief post and a follow-up `/levwork <n> done`.
export async function fetchOpenBrandTasks() {
  const rows = [];
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      filter: { property: 'Status', select: { does_not_equal: 'Completed' } },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(
      ...res.results.map((page) => ({
        id: page.id,
        content: plainTitle(page.properties['Task']),
        status: page.properties['Status']?.select?.name ?? 'Not Started',
      })),
    );
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// Mark the nth open task (1-based, in the same order the brief numbers them)
// as Completed. Returns the task, or null if n is out of range.
export async function completeBrandTask(n) {
  const open = await fetchOpenBrandTasks();
  const task = open[n - 1];
  if (!task) return null;
  await notion.pages.update({
    page_id: task.id,
    properties: { Status: { select: { name: 'Completed' } } },
  });
  return task;
}
