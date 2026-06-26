import fs from 'node:fs'
import path from 'node:path'
import type { ContextSievePlugin, PluginManifest } from './sdk/types.js'

const PLUGINS_DIR = path.join(process.cwd(), 'plugins')
const PLUGIN_MANIFEST_FILE = path.join(PLUGINS_DIR, 'manifest.json')

function ensureDir(): void {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true })
  }
}

function loadManifests(): PluginManifest[] {
  ensureDir()
  if (!fs.existsSync(PLUGIN_MANIFEST_FILE)) {
    fs.writeFileSync(PLUGIN_MANIFEST_FILE, '[]', 'utf-8')
    return []
  }
  try {
    const raw = fs.readFileSync(PLUGIN_MANIFEST_FILE, 'utf-8')
    return JSON.parse(raw) as PluginManifest[]
  } catch {
    return []
  }
}

function saveManifests(manifests: PluginManifest[]): void {
  ensureDir()
  fs.writeFileSync(PLUGIN_MANIFEST_FILE, JSON.stringify(manifests, null, 2), 'utf-8')
}

function pluginDir(id: string): string {
  return path.join(PLUGINS_DIR, id)
}

function pluginFile(id: string): string {
  return path.join(pluginDir(id), 'plugin.js')
}

function pluginMetaFile(id: string): string {
  return path.join(pluginDir(id), 'plugin.json')
}

export async function loadPlugin(id: string): Promise<ContextSievePlugin> {
  const pf = pluginFile(id)
  if (!fs.existsSync(pf)) {
    throw new Error(`Plugin file not found: ${pf}`)
  }
  const mod = await import(pf)
  if (!mod.default) {
    throw new Error(`Plugin "${id}" does not export a default plugin object`)
  }
  const plugin = mod.default as ContextSievePlugin
  if (plugin.id !== id) {
    throw new Error(`Plugin id mismatch: expected "${id}", got "${plugin.id}"`)
  }
  return plugin
}

export async function registerPlugin(
  id: string,
  plugin: ContextSievePlugin,
): Promise<PluginManifest> {
  const dir = pluginDir(id)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(pluginMetaFile(id), JSON.stringify({ id, version: plugin.version, path: pluginFile(id) }, null, 2), 'utf-8')

  const manifests = loadManifests()
  if (manifests.find(m => m.id === id)) {
    throw new Error(`Plugin "${id}" is already registered`)
  }
  const manifest: PluginManifest = {
    id,
    version: plugin.version,
    path: pluginFile(id),
    enabled: false,
  }
  manifests.push(manifest)
  saveManifests(manifests)
  return manifest
}

export function enablePlugin(id: string): PluginManifest | null {
  const manifests = loadManifests()
  const m = manifests.find(m => m.id === id)
  if (!m) return null
  m.enabled = true
  saveManifests(manifests)
  return m
}

export function disablePlugin(id: string): PluginManifest | null {
  const manifests = loadManifests()
  const m = manifests.find(m => m.id === id)
  if (!m) return null
  m.enabled = false
  saveManifests(manifests)
  return m
}

export function listPlugins(): PluginManifest[] {
  return loadManifests()
}

export function getPluginManifest(id: string): PluginManifest | null {
  return loadManifests().find(m => m.id === id) ?? null
}

// fallow-ignore-next-line unused-export
export function isPluginEnabled(id: string): boolean {
  return loadManifests().some(m => m.id === id && m.enabled)
}

// fallow-ignore-next-line unused-export
export function getEnabledPlugins(): PluginManifest[] {
  return loadManifests().filter(m => m.enabled)
}
