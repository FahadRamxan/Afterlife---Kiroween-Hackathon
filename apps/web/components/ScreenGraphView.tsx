'use client';
import { Background, ReactFlow, useNodesState, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import type { GraphEdge, GraphNode } from '../lib/theater';

const COLS = 3;

/**
 * The screens the Possessor has found (React Flow): one node per screen title in the order found,
 * with how many states of it were seen, the one it is on now lit in ectoplasm, and the keys that
 * led from one to another. The same list is
 * given to screen readers as text.
 */
export function ScreenGraphView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const t = useTranslations('raise.live.theater');
  // A screen seen in several states (a bill with lines added): "NEW BILL · 4 states".
  const label = (n: GraphNode) =>
    n.states > 1 ? t('states', { title: n.title, n: n.states }) : n.title;
  const flowNodes = useMemo<Node[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        position: { x: (n.order % COLS) * 170, y: Math.floor(n.order / COLS) * 90 },
        data: { label: label(n) },
        draggable: false,
        connectable: false,
        className: n.current ? 'theater-node theater-node-current' : 'theater-node',
        style: {
          background: 'var(--color-graveyard)',
          color: 'var(--color-bone)',
          border: `1px solid ${n.current ? 'var(--color-ectoplasm)' : 'color-mix(in srgb, var(--color-bone) 35%, transparent)'}`,
          boxShadow: n.current ? '0 0 12px var(--color-ectoplasm)' : 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          width: 140,
        },
      })),
    [nodes, t],
  );
  // React Flow measures each node before it shows it, so it keeps the nodes in its own state.
  const [shown, setShown, onNodesChange] = useNodesState<Node>(flowNodes);
  useEffect(() => setShown(flowNodes), [flowNodes, setShown]);
  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        labelStyle: { fill: 'var(--color-bone)', fontFamily: 'var(--font-mono)', fontSize: 10 },
        labelBgStyle: { fill: 'var(--color-graveyard)' },
        style: { stroke: 'color-mix(in srgb, var(--color-bone) 45%, transparent)' },
      })),
    [edges],
  );
  return (
    <figure data-testid="screen-graph" data-nodes={nodes.length} className="mt-3">
      <figcaption className="text-sm font-semibold">{t('graph')}</figcaption>
      <div
        aria-hidden="true"
        className="mt-1 h-64 rounded-md border border-bone/15"
        lang="en"
        dir="ltr"
      >
        {/* Mounted again for each new screen, so the view fits all of them. */}
        <ReactFlow
          key={nodes.length}
          nodes={shown}
          onNodesChange={onNodesChange}
          edges={flowEdges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background gap={24} />
        </ReactFlow>
      </div>
      <ol className="sr-only" lang="en" dir="ltr">
        {nodes.map((n) => (
          <li key={n.id} data-testid="graph-node" data-current={n.current} data-states={n.states}>
            {label(n)}
          </li>
        ))}
      </ol>
    </figure>
  );
}
