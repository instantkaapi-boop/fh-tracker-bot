import { Client } from '@notionhq/client';

export const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});

const DATA_SOURCE_ID = process.env.MASTER_TRACKER_DATA_SOURCE;

export const EDIT_TYPES = ['Fazil Only', 'Jishnu Only', 'Jishnu + Fazil'];

function plainTitle(prop) {
  return (prop?.title ?? []).map((t) => t.plain_text).join('').trim();
}

function selectName(prop) {
  return prop?.select?.name ?? null;
}

function dateStart(prop) {
  return prop?.date?.start ?? null;
}

export function parseRow(page) {
  const p = page.properties;
  return {
    id: page.id,
    url: page.url,
    content: plainTitle(p['Content']),
    pipelineStatus: selectName(p['Pipeline Status']),
    editType: selectName(p['Edit Type']),
    videoType: selectName(p['Video type']),
    posted: p['Posted']?.checkbox ?? false,
    celebrated: p['Celebrated']?.checkbox ?? false,
    expectedDate: dateStart(p['Expected date']),
    editingStartDate: dateStart(p['Editing Start Date']),
    editingEndHandover: dateStart(p['Editing End/ Handover']),
    fEditingStart: dateStart(p['F editing start']),
    fEditingDone: dateStart(p['F editing Done']),
    completionDate: dateStart(p['Completion date']),
    lastEdited: page.last_edited_time,
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

// Posted rows not yet celebrated — drives the posted-celebration job.
export async function fetchUncelebratedPostedRows() {
  return queryAll({
    and: [
      { property: 'Posted', checkbox: { equals: true } },
      { property: 'Celebrated', checkbox: { equals: false } },
    ],
  });
}

export async function markCelebrated(pageId) {
  await notion.pages.update({
    page_id: pageId,
    properties: { Celebrated: { checkbox: true } },
  });
}

// Rows with a Completion date inside [startDate, endDate] (both YYYY-MM-DD, inclusive) — weekly stats.
export async function fetchRowsCompletedBetween(startDate, endDate) {
  return queryAll({
    and: [
      { property: 'Completion date', date: { on_or_after: startDate } },
      { property: 'Completion date', date: { on_or_before: endDate } },
    ],
  });
}

export async function fetchRow(pageId) {
  const page = await notion.pages.retrieve({ page_id: pageId });
  return parseRow(page);
}

export async function updateRow(pageId, properties) {
  await notion.pages.update({ page_id: pageId, properties });
}

// New tracker row from Telegram (/add). editType may be null = needs assignment.
export async function createRow({ content, editType, expectedDate, videoType }) {
  const properties = {
    Content: { title: [{ text: { content } }] },
    'Pipeline Status': { select: { name: 'Ideation' } },
  };
  if (editType) properties['Edit Type'] = { select: { name: editType } };
  if (expectedDate) properties['Expected date'] = { date: { start: expectedDate } };
  if (videoType) properties['Video type'] = { select: { name: videoType } };
  const page = await notion.pages.create({
    parent: { data_source_id: DATA_SOURCE_ID },
    properties,
  });
  return parseRow(page);
}

// Notion webhook events reference properties by id, not name. Cached per
// function instance; the schema changes rarely.
let propertyIdCache = null;
export async function propertyNamesById() {
  if (propertyIdCache) return propertyIdCache;
  const ds = await notion.dataSources.retrieve({ data_source_id: DATA_SOURCE_ID });
  propertyIdCache = Object.fromEntries(Object.entries(ds.properties).map(([name, def]) => [def.id, name]));
  return propertyIdCache;
}
