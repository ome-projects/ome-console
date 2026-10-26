import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ComponentConfigCard, RuntimeComponentCards, RuntimeTypeBadge } from './ComponentConfigCard'
import type { EngineConfig, ServingRuntimeSpec } from '@/lib/types/runtime'

const multiNodeEngine: EngineConfig = {
  leader: {
    runner: {
      name: 'ome-container',
      image: 'vllm/vllm:0.9',
      command: ['python', '-m', 'vllm.entrypoints', '--tensor-parallel-size', '8'],
      env: [
        { name: 'MODEL_PATH', value: '/mnt/models' },
        { name: 'HF_TOKEN', valueFrom: { secretKeyRef: { name: 'hf', key: 'token' } } },
      ],
      resources: { limits: { 'nvidia.com/gpu': '8' } },
    },
    nodeSelector: { 'node.kubernetes.io/instance-type': 'h100' },
  },
  worker: { size: 3, runner: { name: 'worker', image: 'vllm/vllm:0.9' } },
}

describe('ComponentConfigCard', () => {
  it('renders nothing for an absent component', () => {
    const { container } = render(<ComponentConfigCard component="decoder" config={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a single-node runner with its image, env, resources and args', () => {
    render(
      <ComponentConfigCard
        component="engine"
        config={{
          runner: {
            name: 'ome-container',
            image: 'sglang:0.4',
            args: ['--model', '/mnt', '--port', '8080'],
            env: [{ name: 'PORT', value: '8080' }],
            resources: { requests: { cpu: '4' } },
          },
        }}
      />
    )
    const card = screen.getByRole('region', { name: /Engine Configuration/ })
    expect(within(card).getByText('Single Node', { exact: false })).toBeInTheDocument()
    expect(within(card).getByText('Image: sglang:0.4')).toBeInTheDocument()
    expect(within(card).getByText('PORT=8080')).toBeInTheDocument()
    expect(within(card).getByText('cpu:')).toBeInTheDocument()
    expect(within(card).getByText('Args (4)', { exact: false })).toBeInTheDocument()
    expect(within(card).getByText(/--model \/mnt/)).toBeInTheDocument()
    expect(within(card).queryByText(/Command/)).not.toBeInTheDocument()
  })

  it('renders leader and worker pods of a multi-node engine', () => {
    render(<ComponentConfigCard component="engine" config={multiNodeEngine} />)
    const card = screen.getByRole('region', { name: /Engine Configuration/ })
    expect(within(card).queryByText(/Single Node/)).not.toBeInTheDocument()
    expect(within(card).getByText(/Leader Node/)).toBeInTheDocument()
    expect(within(card).getByText(/Worker Nodes/)).toBeInTheDocument()
    expect(within(card).getByText('3 nodes')).toBeInTheDocument()
    expect(within(card).getByText('MODEL_PATH=/mnt/models')).toBeInTheDocument()
    expect(within(card).getByText('HF_TOKEN=[from field]')).toBeInTheDocument()
    expect(within(card).getByText('Command (5 args)', { exact: false })).toBeInTheDocument()
    expect(within(card).getByText('node.kubernetes.io/instance-type: h100')).toBeInTheDocument()
    expect(within(card).getAllByText('Image: vllm/vllm:0.9')).toHaveLength(2)
  })

  it('says when a leader has no runner', () => {
    render(<ComponentConfigCard component="decoder" config={{ leader: {} }} />)
    expect(screen.getByText('No runner configuration')).toBeInTheDocument()
  })
})

describe('RuntimeComponentCards', () => {
  it('shows router, engine and decoder cards but not plain containers for a PD runtime', () => {
    const spec: ServingRuntimeSpec = {
      routerConfig: { runner: { name: 'router', image: 'router:1' } },
      engineConfig: { runner: { image: 'engine:1' } },
      decoderConfig: { runner: { image: 'decoder:1' } },
      containers: [{ name: 'ignored', image: 'ignored:1' }],
    }
    render(<RuntimeComponentCards spec={spec} />)
    expect(screen.getByRole('region', { name: /Router Configuration/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Engine Configuration/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Decoder Configuration/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Containers' })).not.toBeInTheDocument()
  })

  it('shows the plain containers of a standard runtime', () => {
    render(
      <RuntimeComponentCards
        spec={{
          containers: [
            { name: 'ome-container', image: 'triton:24', env: [{ name: 'A', value: '1' }] },
          ],
        }}
      />
    )
    const card = screen.getByRole('region', { name: 'Containers' })
    expect(within(card).getByText('Containers (1)', { exact: false })).toBeInTheDocument()
    expect(within(card).getByText('triton:24')).toBeInTheDocument()
    expect(within(card).getByText('A=1')).toBeInTheDocument()
  })
})

describe('RuntimeTypeBadge', () => {
  it('names the runtime shape', () => {
    const { rerender } = render(<RuntimeTypeBadge spec={{ engineConfig: {}, decoderConfig: {} }} />)
    expect(screen.getByText(/PREFILL-DECODE DISAGGREGATED/)).toBeInTheDocument()

    rerender(<RuntimeTypeBadge spec={{ engineConfig: {} }} />)
    expect(screen.getByText('ENGINE ONLY')).toBeInTheDocument()

    rerender(<RuntimeTypeBadge spec={{ decoderConfig: {} }} />)
    expect(screen.getByText('DECODER ONLY')).toBeInTheDocument()

    rerender(<RuntimeTypeBadge spec={{ containers: [] }} />)
    expect(screen.getByText('STANDARD RUNTIME')).toBeInTheDocument()

    rerender(<RuntimeTypeBadge spec={{}} />)
    expect(screen.queryByText(/RUNTIME|ONLY|PDD/)).not.toBeInTheDocument()
  })
})
