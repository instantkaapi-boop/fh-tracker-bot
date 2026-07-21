import 'dotenv/config';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN, notionVersion: '2025-09-03' });
const DATA_SOURCE_ID = process.env.MASTER_TRACKER_DATA_SOURCE;

const ds = await notion.dataSources.retrieve({ data_source_id: DATA_SOURCE_ID });
if (ds.properties['Celebrated']) {
  console.log('Celebrated property already exists, nothing to do.');
} else {
  await notion.dataSources.update({
    data_source_id: DATA_SOURCE_ID,
    properties: { Celebrated: { checkbox: {} } },
  });
  console.log('Added Celebrated checkbox property to Master Content Tracker.');
}
