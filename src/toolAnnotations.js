'use strict';

/**
 * Public MCP safety contract.
 *
 * ChatGPT app review requires every exposed tool to declare all three hints.
 * Keep this map exact: the submission gate rejects missing, duplicate, stale,
 * or non-boolean entries whenever the registered tool surface changes.
 */

const READ_ONLY = [
  'get_creative_director_status', 'get_generation_status', 'list_models',
  'check_credits', 'show_plans', 'get_session_usage', 'list_voices',
  'chat_list_conversations', 'chat_get_messages',
  'list_visual_dnas', 'get_visual_dna', 'list_visual_dna_folders',
  'list_moodboards', 'get_moodboard',
  'list_color_palettes', 'analyze_color_palette',
  'list_media', 'list_media_folders', 'get_media', 'get_media_stats',
  'list_presets', 'list_cinematic_presets',
  'list_projects', 'get_project', 'list_sessions', 'list_project_context', 'get_project_profile',
  'list_project_assets',
  'list_session_generations',
  'list_agents', 'list_docs', 'get_doc',
  'get_review_storage_usage', 'list_review_assets', 'get_review_asset',
  'list_review_collections', 'list_review_comments', 'list_review_share_links',
  'search_music_library', 'analyze_script_for_music', 'browse_music_library',
  'get_music_library_facets', 'get_music_track_audio',
  'get_music_track_related', 'get_music_track_lyrics',
  'search_stock_media', 'get_stock_sources', 'get_stock_categories',
  'get_stock_collections', 'get_stock_asset', 'analyze_script_for_stock',
];

const OPEN_WORLD_READ_ONLY = [
  'blender_list_sessions', 'blender_get_scene', 'blender_search_docs',
  'blender_get_command_status',
];

const PRIVATE_WRITE = [
  'media_upload_widget', 'create_upload_ticket', 'upload_media',
  'favorite_media', 'unfavorite_media',
  'create_media_folder', 'update_media_folder',
  'add_media_to_folder', 'remove_media_from_folder',
  'share_media_folder',
  'restore_media', 'move_media', 'bulk_restore_media', 'bulk_move_media',
  'move_folder_contents',
  'import_elevenlabs_voice',
  'create_visual_dna', 'create_visual_dna_folder', 'update_visual_dna_folder',
  'move_visual_dna_to_folder',
  'create_moodboard',
  'create_color_palette', 'activate_color_palette', 'deactivate_color_palette',
  'move_session', 'bulk_move_sessions', 'move_generations_to_session',
  'split_session', 'undo_session_organization',
  'rename_session', 'restore_session',
  'create_project', 'duplicate_project', 'update_project',
  'archive_project', 'unarchive_project', 'add_project_context',
  'link_project_asset', 'unlink_project_asset',
  'create_agent',
  'create_doc',
  'create_review_asset', 'update_review_asset', 'add_review_version',
  'set_review_status', 'create_review_collection', 'update_review_collection',
  'create_review_comment', 'reply_review_comment',
  'resolve_review_comment', 'unresolve_review_comment',
  'import_stock_asset',
];

const DESTRUCTIVE_WRITE = [
  // These actions spend credits, enqueue irreversible work, or cancel it.
  'generate_image', 'generate_image_edit', 'generate_creative_director',
  'generate_video', 'generate_video_from_image', 'generate_music',
  'generate_speech', 'generate_sound', 'cancel_generation',
  'generate_elements', 'generate_first_last_frame', 'generate_lipsync',
  'generate_video_from_video', 'transcribe_audio', 'generate_3d',
  'edit_image', 'edit_video', 'trim_video', 'clone_voice',
  'chat_send_message', 'generate_character_sheet',
  'acquire_clean_music_track', 'import_music_track_to_library',
  'separate_audio_stems', 'clean_dialogue_leftovers', 'separate_ambience',
  'analyze_video',

  // Deletes and whole-value replacement updates are conservatively destructive.
  'delete_voice', 'update_visual_dna', 'delete_visual_dna', 'delete_visual_dna_folder',
  'update_moodboard', 'delete_moodboard',
  'update_color_palette', 'delete_color_palette',
  'delete_media_folder', 'delete_media', 'permanently_delete_media',
  'bulk_delete_media', 'bulk_permanently_delete_media',
  'unshare_media_folder',
  'delete_session',
  'delete_project_context', 'regenerate_project_profile',
  'update_project_asset',
  'update_agent', 'delete_agent', 'update_doc', 'delete_doc',
  'delete_review_asset', 'delete_review_collection',
  'edit_review_comment', 'delete_review_comment',
];

const OPEN_WORLD_WRITE = [
  'publish_html_artifact', 'create_review_share_link', 'blender_capture_viewport',
];

const OPEN_WORLD_DESTRUCTIVE = [
  'share_doc', 'revoke_review_share_link',
  'blender_apply_operations', 'blender_import_media', 'blender_render',
  'blender_undo', 'blender_file_operation', 'blender_execute_python',
];

const CONTRACT_GROUPS = [
  [READ_ONLY, { readOnlyHint: true, openWorldHint: false, destructiveHint: false }],
  [OPEN_WORLD_READ_ONLY, { readOnlyHint: true, openWorldHint: true, destructiveHint: false }],
  [PRIVATE_WRITE, { readOnlyHint: false, openWorldHint: false, destructiveHint: false }],
  [DESTRUCTIVE_WRITE, { readOnlyHint: false, openWorldHint: false, destructiveHint: true }],
  [OPEN_WORLD_WRITE, { readOnlyHint: false, openWorldHint: true, destructiveHint: false }],
  [OPEN_WORLD_DESTRUCTIVE, { readOnlyHint: false, openWorldHint: true, destructiveHint: true }],
];

function buildToolAnnotations() {
  const annotations = Object.create(null);
  for (const [names, hints] of CONTRACT_GROUPS) {
    for (const name of names) {
      if (annotations[name]) throw new Error(`Duplicate safety annotation contract for tool: ${name}`);
      annotations[name] = Object.freeze({ ...hints });
    }
  }
  return Object.freeze(annotations);
}

const TOOL_ANNOTATIONS = buildToolAnnotations();

function attachToolAnnotations(server) {
  const registered = server?._registeredTools || {};
  const registeredNames = Object.keys(registered).sort();
  const contractNames = Object.keys(TOOL_ANNOTATIONS).sort();
  const missing = registeredNames.filter((name) => !TOOL_ANNOTATIONS[name]);
  const stale = contractNames.filter((name) => !registered[name]);
  if (missing.length || stale.length) {
    throw new Error(
      `Tool annotation contract mismatch. Missing: ${missing.join(', ') || 'none'}. `
      + `Stale: ${stale.join(', ') || 'none'}.`
    );
  }
  for (const name of registeredNames) registered[name].annotations = TOOL_ANNOTATIONS[name];
}

module.exports = {
  TOOL_ANNOTATIONS,
  CONTRACT_GROUPS,
  attachToolAnnotations,
};
