/**
 * Programmatic surface of the CLI, for the GitHub Action (M6): run the same
 * check the terminal runs and get the exit code and CheckResult back without
 * spawning a process.
 */
export { check, type CheckOptions } from './commands/check.js'
export { init, type InitOptions } from './commands/init.js'
export { loadProject, CONFIG_FILE, BASELINE_FILE, type LoadResult, type LoadedProject } from './project.js'
export { renderReport, renderFailure, type RenderOptions } from './output/render.js'
export { main, type MainIo } from './main.js'
