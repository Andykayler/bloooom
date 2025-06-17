import React, { useState, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FaProjectDiagram, FaLightbulb, FaClipboardList, FaTimes, FaDownload, FaExpand, FaCompress } from 'react-icons/fa';
import './mind.css';

const MindMapPopup = ({ isOpen, onClose, mindMapData, resourceTitle }) => {
  const [viewMode, setViewMode] = useState('flow');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState(mindMapData?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(mindMapData?.edges || []);

  // Update nodes and edges when mindMapData changes
  useEffect(() => {
    console.log('mindMapData:', mindMapData); // Debug: Log mindMapData
    if (mindMapData?.nodes) {
      setNodes(mindMapData.nodes);
      console.log('Nodes set:', mindMapData.nodes); // Debug: Log nodes
    }
    if (mindMapData?.edges) {
      setEdges(mindMapData.edges);
      console.log('Edges set:', mindMapData.edges); // Debug: Log edges
    }
  }, [mindMapData, setNodes, setEdges]);

  if (!isOpen) return null;

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const downloadMindMap = () => {
    const dataStr = JSON.stringify({ nodes, edges, concepts: mindMapData?.concepts, summary: mindMapData?.summary }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${resourceTitle || 'mindmap'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`mindmap-modal ${isOpen ? 'open' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      <div className="mindmap-modal-content">
        <div className="mindmap-header">
          <h3>Mind Map: {resourceTitle || 'Untitled'}</h3>
          <div className="mindmap-controls">
            <button
              className="fullscreen-mindmap-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <FaCompress /> : <FaExpand />}
            </button>
            <button className="close-mindmap-btn" onClick={onClose} title="Close Mind Map">
              <FaTimes />
            </button>
          </div>
        </div>

        {viewMode === 'flow' && (
          <div className="mindmap-container" style={{ height: '500px', minHeight: '300px' }}>
            {nodes.length === 0 && edges.length === 0 ? (
              <div className="no-data-message">No mind map data available. Please try generating again.</div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                attributionPosition="bottom-right"
              >
                <Background color="#f8fafc" gap={16} />
                <Controls />
              </ReactFlow>
            )}
          </div>
        )}

        {viewMode === 'concepts' && mindMapData && (
          <div className="concept-list">
            <h3>Key Concepts</h3>
            {mindMapData.concepts?.length ? (
              <div className="concepts-grid">
                {mindMapData.concepts.map((concept) => (
                  <div key={concept.id} className="concept-card">
                    <h4>{concept.label}</h4>
                    <div className="concept-connections">
                      <span>
                        {concept.connections} connection{concept.connections !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No concepts available.</p>
            )}
          </div>
        )}

        {viewMode === 'summary' && mindMapData && (
          <div className="mind-map-summary">
            <h3>{mindMapData.summary?.title || 'Summary'}</h3>
            <p className="summary-overview">{mindMapData.summary?.overview || 'No overview available.'}</p>

            <h4>Key Points</h4>
            {mindMapData.summary?.keyPoints?.length ? (
              <ul className="key-points-list">
                {mindMapData.summary.keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            ) : (
              <p>No key points available.</p>
            )}

            {mindMapData.summary?.stats && (
              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-label">Concepts</span>
                  <span className="stat-value">{mindMapData.summary.stats.conceptCount || 0}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Connections</span>
                  <span className="stat-value">{mindMapData.summary.stats.connectionCount || 0}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Complexity</span>
                  <span className="stat-value">{mindMapData.summary.stats.complexity || 'N/A'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="view-mode-toggle">
          <button
            className={`view-mode-btn ${viewMode === 'flow' ? 'active' : ''}`}
            onClick={() => setViewMode('flow')}
          >
            <FaProjectDiagram /> Flow View
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'concepts' ? 'active' : ''}`}
            onClick={() => setViewMode('concepts')}
          >
            <FaLightbulb /> Concepts
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'summary' ? 'active' : ''}`}
            onClick={() => setViewMode('summary')}
          >
            <FaClipboardList /> Summary
          </button>
        </div>

        <div className="mindmap-footer">
          <button className="download-mindmap-btn" onClick={downloadMindMap}>
            <FaDownload /> Export Mind Map
          </button>
        </div>
      </div>
    </div>
  );
};

export default MindMapPopup;