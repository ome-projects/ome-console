'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { runtimesApi } from '@/lib/api/runtimes'
import { useQueryClient } from '@tanstack/react-query'
import * as yaml from 'js-yaml'
import { ModelFormatsDisplay } from '@/components/ui/ModelFormatsDisplay'
import { MetadataCollapsible } from '@/components/ui/MetadataCollapsible'
import { RuntimeComponentCards, RuntimeTypeBadge } from '@/components/runtimes/ComponentConfigCard'

type ImportMethod = 'upload' | 'url'

export default function ImportRuntimePage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [method, setMethod] = useState<ImportMethod>('upload')
  const [yamlContent, setYamlContent] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [parsedRuntime, setParsedRuntime] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [showYaml, setShowYaml] = useState(false)

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setYamlContent(content)
      validateYAML(content)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
  }

  // Handle drag and drop
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setYamlContent(content)
      validateYAML(content)
    }
    reader.readAsText(file)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  // Validate and convert GitHub URL to raw URL
  const convertToRawGitHubUrl = (url: string): string | null => {
    try {
      const parsedUrl = new URL(url)
      const hostname = parsedUrl.hostname.toLowerCase()

      // Only allow github.com and raw.githubusercontent.com
      if (hostname === 'raw.githubusercontent.com') {
        return url // Already a raw URL
      }

      if (hostname === 'github.com') {
        // Convert github.com/user/repo/blob/branch/path to raw.githubusercontent.com/user/repo/branch/path
        const pathParts = parsedUrl.pathname.split('/')
        if (pathParts.length >= 5 && pathParts[3] === 'blob') {
          // Remove 'blob' from path: /user/repo/blob/branch/path -> /user/repo/branch/path
          pathParts.splice(3, 1)
          return `https://raw.githubusercontent.com${pathParts.join('/')}`
        }
        return null // Invalid GitHub URL format
      }

      return null // Not a valid GitHub domain
    } catch {
      return null // Invalid URL
    }
  }

  // Fetch YAML from GitHub URL
  const fetchFromGitHub = async () => {
    if (!githubUrl) {
      setError('Please enter a GitHub URL')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Validate and convert GitHub URL to raw URL
      const rawUrl = convertToRawGitHubUrl(githubUrl)
      if (!rawUrl) {
        throw new Error(
          'Invalid GitHub URL. Please use a URL from github.com or raw.githubusercontent.com pointing to a YAML file.'
        )
      }

      const response = await fetch(`/api/v1/runtimes/fetch-yaml?url=${encodeURIComponent(rawUrl)}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`)
      }

      const data = await response.json()
      setYamlContent(data.content)
      validateYAML(data.content)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch YAML from URL')
    } finally {
      setIsLoading(false)
    }
  }

  // Validate and parse YAML
  const validateYAML = (content: string) => {
    try {
      const parsed = yaml.load(content) as any

      // Validate that it's a runtime
      if (
        !parsed.kind ||
        (parsed.kind !== 'ClusterServingRuntime' && parsed.kind !== 'ServingRuntime')
      ) {
        throw new Error('YAML must be a ClusterServingRuntime or ServingRuntime resource')
      }

      if (!parsed.apiVersion || !parsed.apiVersion.startsWith('ome.io/')) {
        throw new Error('Invalid apiVersion. Must be ome.io/v1beta1 or similar')
      }

      if (!parsed.metadata?.name) {
        throw new Error('Runtime must have a metadata.name field')
      }

      setParsedRuntime(parsed)
      setError(null)
    } catch (err) {
      setParsedRuntime(null)
      setError(err instanceof Error ? err.message : 'Invalid YAML format')
    }
  }

  // Import runtime
  const handleImport = async () => {
    if (!parsedRuntime) {
      setError('Please provide valid YAML first')
      return
    }

    setIsImporting(true)
    setError(null)

    try {
      await runtimesApi.create(parsedRuntime)
      await queryClient.invalidateQueries({ queryKey: ['runtimes'] })
      router.push('/runtimes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import runtime')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="relative border-b border-border/50 bg-card/50 backdrop-blur-sm animate-in">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href="/runtimes"
            className="group inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors mb-4"
          >
            <svg
              className="w-4 h-4 transition-transform group-hover:-translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Runtimes
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Import Runtime</h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Import a ClusterServingRuntime configuration from a local YAML file or remote GitHub
            repository
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 animate-in">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-destructive font-medium">{error}</p>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card shadow-lg animate-in-delay-1">
          {/* Method Tabs */}
          <div className="border-b border-border/50 px-6">
            <nav className="-mb-px flex gap-8">
              <button
                onClick={() => setMethod('upload')}
                className={`relative py-4 px-1 text-sm font-medium transition-colors ${
                  method === 'upload'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Upload YAML
                {method === 'upload' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent rounded-full" />
                )}
              </button>
              <button
                onClick={() => setMethod('url')}
                className={`relative py-4 px-1 text-sm font-medium transition-colors ${
                  method === 'url' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                GitHub URL
                {method === 'url' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent rounded-full" />
                )}
              </button>
            </nav>
          </div>
          <div className="p-6">
            {/* Upload YAML Tab */}
            {method === 'upload' && (
              <div className="space-y-6">
                {/* File Upload Area */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="group relative border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-primary/50 hover:bg-primary/5 transition-all duration-300 cursor-pointer overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <input
                    type="file"
                    accept=".yaml,.yml"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="relative cursor-pointer">
                    <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <svg
                        className="h-8 w-8 text-primary"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="mt-4 text-sm font-medium">
                      <span className="text-primary">Click to upload</span> or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground font-mono">
                      YAML files only (.yaml, .yml)
                    </p>
                  </label>
                </div>

                {/* Simple YAML status */}
                {yamlContent && (
                  <div className="rounded-lg bg-accent/10 border border-accent/20 p-4 animate-in">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                        <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          YAML loaded successfully
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {yamlContent.split('\n').length} lines
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {!yamlContent && (
                  <div>
                    <label className="block text-sm font-medium mb-3">Or paste YAML directly</label>
                    <textarea
                      value={yamlContent}
                      onChange={(e) => {
                        setYamlContent(e.target.value)
                        validateYAML(e.target.value)
                      }}
                      rows={12}
                      className="block w-full rounded-lg border border-border bg-background px-4 py-3 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm transition-all"
                      placeholder="apiVersion: ome.io/v1beta1
kind: ClusterServingRuntime
metadata:
  name: my-runtime
spec:
  ..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* GitHub URL Tab */}
            {method === 'url' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">GitHub URL</label>
                  <div className="flex gap-3">
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/user/repo/blob/main/runtime.yaml"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
                    />
                    <button
                      onClick={fetchFromGitHub}
                      disabled={isLoading || !githubUrl}
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {isLoading ? 'Fetching...' : 'Fetch'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Paste a GitHub URL pointing to a YAML file. Works with both github.com and
                    raw.githubusercontent.com URLs.
                  </p>
                </div>

                {/* YAML Status */}
                {yamlContent && (
                  <div className="rounded-lg bg-blue-50 border border-accent/20 p-3">
                    <div className="flex items-center">
                      <svg
                        className="h-5 w-5 text-blue-600 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="text-sm text-accent/90">
                        YAML fetched successfully ({yamlContent.split('\n').length} lines)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Parsed Runtime Preview */}
            {parsedRuntime && (
              <div className="mt-6 space-y-4">
                {/* Success Banner with Runtime Type */}
                <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start">
                      <svg
                        className="h-5 w-5 text-green-600 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800">
                          Valid Runtime Configuration
                        </h3>
                        <p className="mt-1 text-sm text-green-700">
                          The YAML has been validated and is ready to import.
                        </p>
                      </div>
                    </div>
                    {/* Runtime Type Badge */}
                    <div>
                      <RuntimeTypeBadge spec={parsedRuntime.spec} />
                    </div>
                  </div>
                </div>

                {/* Runtime Details */}
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-base font-medium text-gray-900">Runtime Configuration</h3>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Basic Information</h4>
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Name</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {parsedRuntime.metadata?.name}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Kind</dt>
                          <dd className="mt-1 text-sm text-gray-900">{parsedRuntime.kind}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-gray-500">API Version</dt>
                          <dd className="mt-1 text-sm text-gray-900">{parsedRuntime.apiVersion}</dd>
                        </div>
                        {parsedRuntime.spec?.disabled !== undefined && (
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Status</dt>
                            <dd className="mt-1">
                              <span
                                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                  parsedRuntime.spec.disabled
                                    ? 'bg-gray-100 text-gray-800'
                                    : 'bg-green-100 text-green-800'
                                }`}
                              >
                                {parsedRuntime.spec.disabled ? 'Disabled' : 'Active'}
                              </span>
                            </dd>
                          </div>
                        )}
                        {parsedRuntime.spec?.multiModel !== undefined && (
                          <div>
                            <dt className="text-xs font-medium text-gray-500">Multi-Model</dt>
                            <dd className="mt-1">
                              <span
                                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                  parsedRuntime.spec.multiModel
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {parsedRuntime.spec.multiModel ? 'Enabled' : 'Disabled'}
                              </span>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Metadata - Labels and Annotations */}
                    <MetadataCollapsible
                      labels={parsedRuntime.metadata?.labels}
                      annotations={parsedRuntime.metadata?.annotations}
                    />

                    {/* Supported Model Formats */}
                    <ModelFormatsDisplay
                      formats={parsedRuntime.spec?.supportedModelFormats || []}
                    />

                    {/* Protocol Versions */}
                    {parsedRuntime.spec?.protocolVersions &&
                      parsedRuntime.spec.protocolVersions.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 mb-3">
                            Protocol Versions
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {parsedRuntime.spec.protocolVersions.map(
                              (version: string, idx: number) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-accent ring-1 ring-inset ring-blue-700/10"
                                >
                                  {version}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    <RuntimeComponentCards spec={parsedRuntime.spec} />
                  </div>
                </div>

                {/* YAML Content Viewer - After Runtime Configuration */}
                {yamlContent && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowYaml(!showYaml)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100"
                    >
                      <span className="text-sm font-medium text-gray-700">
                        📄 YAML Content ({yamlContent.split('\n').length} lines)
                      </span>
                      <svg
                        className={`w-5 h-5 text-gray-500 transform transition-transform ${showYaml ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {showYaml && (
                      <div className="p-4 bg-white">
                        <textarea
                          value={yamlContent}
                          onChange={(e) => {
                            setYamlContent(e.target.value)
                            validateYAML(e.target.value)
                          }}
                          rows={20}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500 font-mono text-xs"
                          placeholder="YAML content will appear here..."
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <Link
                href="/runtimes"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                onClick={handleImport}
                disabled={!parsedRuntime || isImporting}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isImporting ? 'Importing...' : 'Import Runtime'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
