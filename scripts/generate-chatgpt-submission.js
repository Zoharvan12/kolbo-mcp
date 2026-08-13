'use strict';

const fs = require('fs');
const path = require('path');
const { TOOL_ANNOTATIONS } = require('../src/toolAnnotations');

function sentenceFor(name, hints) {
  if (hints.readOnlyHint) {
    return {
      read_only_justification: `${name} retrieves or analyzes Kolbo data without changing stored state.`,
      open_world_justification: 'It does not publish content or modify a public or third-party system.',
      destructive_justification: 'It does not delete, overwrite, revoke access, spend credits, or start a paid job.',
    };
  }

  const readOnly = hints.destructiveHint
    ? `${name} changes Kolbo state and can spend credits, replace data, delete data, revoke access, or start an irreversible job.`
    : `${name} creates or updates state in the user's Kolbo account or starts a bounded private workflow.`;
  const openWorld = hints.openWorldHint
    ? `${name} can create, update, expose, or revoke content through a publicly accessible link.`
    : 'Its effects stay inside the user’s private Kolbo account or workspace and do not publish to the public internet.';
  const destructive = hints.destructiveHint
    ? `${name} can perform an irreversible or replacement action, spend credits, delete data, or revoke access.`
    : `${name} does not permanently delete data, overwrite content without recovery, revoke access, or irreversibly spend credits.`;
  return {
    read_only_justification: readOnly,
    open_world_justification: openWorld,
    destructive_justification: destructive,
  };
}

const tools = Object.fromEntries(Object.entries(TOOL_ANNOTATIONS).map(([name, annotations]) => [
  name,
  { annotations, justifications: sentenceFor(name, annotations) },
]));

const output = {
  $schema: 'https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json',
  schema_version: 1,
  app_info: {
    display_name: 'Kolbo.AI',
    subtitle: 'Create AI media',
    description: 'Kolbo.AI helps users create and edit images, video, music, speech, sound, and 3D assets, then organize the results in projects, documents, review spaces, and a synchronized media library.',
    category: 'DESIGN',
  },
  tools,
  test_cases: [
    {
      description: 'Discover an appropriate image model before generation.',
      user_prompt: 'Show me suitable Kolbo image models for a polished ecommerce hero image.',
      file_attachment_urls: null,
      tools_triggered: 'list_models',
      expected_output: 'Returns current image models with identifiers, relevant strengths, capabilities, and credit information.',
      expected_output_url: null,
    },
    {
      description: 'Generate a new image in Kolbo.',
      user_prompt: 'Create a cinematic 16:9 campaign image of a glass perfume bottle on black stone with soft violet light.',
      file_attachment_urls: null,
      tools_triggered: 'generate_image',
      expected_output: 'Creates the requested image, reports the selected model and credit use, and returns the resulting media and session details.',
      expected_output_url: null,
    },
    {
      description: 'Browse the authenticated user’s media library.',
      user_prompt: 'Show my most recent Kolbo videos.',
      file_attachment_urls: null,
      tools_triggered: 'list_media',
      expected_output: 'Returns the user’s recent video items with useful metadata and media previews without modifying the library.',
      expected_output_url: null,
    },
    {
      description: 'Create a project-scoped editable document.',
      user_prompt: 'Create a Kolbo AI Doc titled Launch Shot List with a concise six-shot product-video plan.',
      file_attachment_urls: null,
      tools_triggered: 'create_doc',
      expected_output: 'Creates the complete editable document in the user’s Kolbo workspace and returns its identifier and access details.',
      expected_output_url: null,
    },
    {
      description: 'Search for ready-made stock media.',
      user_prompt: 'Find vertical stock footage of neon city streets at night for social video b-roll.',
      file_attachment_urls: null,
      tools_triggered: 'search_stock_media',
      expected_output: 'Returns relevant normalized stock results with source, preview, licensing, attribution, and available variants.',
      expected_output_url: null,
    },
  ],
  negative_test_cases: [
    {
      description: 'Do not trigger Kolbo for unrelated calendar requests.',
      user_prompt: 'What meetings do I have tomorrow?',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'Kolbo should not be invoked because calendar management is outside its supported workflows.',
      expected_output_url: null,
    },
    {
      description: 'Do not trigger Kolbo for ordinary factual questions that need no creative workflow.',
      user_prompt: 'What is the capital of Portugal?',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'Kolbo should not be invoked because the question can be answered directly without Kolbo data or media tools.',
      expected_output_url: null,
    },
    {
      description: 'Do not trigger a destructive action from an ambiguous request.',
      user_prompt: 'Clean up my files.',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output: 'The assistant should clarify scope and intent instead of invoking a delete or permanent-delete tool.',
      expected_output_url: null,
    },
  ],
};

fs.writeFileSync(path.join(__dirname, '..', 'chatgpt-app-submission.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`[submission] Wrote ${Object.keys(tools).length} tool contracts, 5 positive tests, and 3 negative tests.`);
