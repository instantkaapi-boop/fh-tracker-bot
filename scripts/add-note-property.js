import 'dotenv/config';
import { Client } from '@notionhq/client';

// One-off: adds the "Note" rich-text column the /late and /wfh commands write to.
const notion = new Client({ auth: process.env.NOTION_TOKEN, notionVersion: '2025-09-03' });
const DATA_SOURCE_ID = process.env.CHECKIN_DATA_SOURCE;

const ds = await notion.dataSources.retrieve({ data_source_id: DATA_SOURCE_ID });
if (ds.properties['Note']) {
  console.log('Note property already exists, nothing to do.');
} else {
  await notion.dataSources.update({
    data_source_id: DATA_SOURCE_ID,
    properties: { Note: { rich_text: {} } },
  });
  console.log('Added Note rich-text property to Daily Check-in.');
}
