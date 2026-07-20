import { Client } from '@notionhq/client';

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});

const DATA_SOURCE_ID = process.env.MASTER_TRACKER_DATA_SOURCE;

function plainTitle(prop) {
  return (prop?.title ?? []).map((t) => t.plain_text).join('').trim();
}

function selectName(prop) {
  return prop?.select?.name ?? null;
}

function dateStart(prop) {
  return prop?.date?.start ?? null;
}

function parseRow(page) {
  const p = page.properties;
  return {
    id: page.id,
    url: page.url,
    content: plainTitle(p['Content']),
    pipelineStatus: selectName(p['Pipeline Status']),
    editType: selectName(p['Edit Type']),
    posted: p['Posted']?.checkbox ?? false,
    expectedDate: dateStart(p['Expected date']),
    editingStartDate: dateStart(p['Editing Start Date']),
    editingEndHandover: dateStart(p['Editing End/ Handover']),
    fEditingStart: dateStart(p['F editing start']),
    fEditingDone: dateStart(p['F editing Done']),
    completionDate: dateStart(p['Completion date']),
  };
}

async function queryAll(filter) {
  const rows = [];
  let cursor = undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      filter,
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(...res.results.map(parseRow));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// Rows still open (not posted yet) — the brief's working set.
export async function fetchOpenRows() {
  return queryAll({
    property: 'Posted',
    checkbox: { equals: false },
  });
}

// Title substring search across all rows, posted or not — for /status lookups.
export async function searchByTitle(query) {
  const rows = await queryAll({
    property: 'Content',
    title: { contains: query },
  });
  return rows;
}
