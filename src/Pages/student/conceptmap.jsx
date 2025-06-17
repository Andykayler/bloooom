import React, { useEffect, useState } from 'react';
import ReactFlow, { Controls } from 'reactflow';
import 'reactflow/dist/style.css';

export default function ConceptMap({ resourceId }) {
  const [mindmap, setMindmap] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchMindmap() {
      try {
        const res = await fetch('/mindmap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceId }),
        });
        const data = await res.json();
        if (data.status === 'success') {
          setMindmap(data.mindmap);
        } else {
          setError(data.error || data.message);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchMindmap();
  }, [resourceId]);

  if (loading) return <div>Loading mind map...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div style={{ width: '100%', height: '500px' }}>
      <ReactFlow
        nodes={mindmap.nodes}
        edges={mindmap.edges}
        fitView
      >
        <Controls />
      </ReactFlow>
    </div>
  );
}