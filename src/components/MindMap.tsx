import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { v4 as uuidv4 } from 'uuid';
import { Settings, Maximize, Target, Plus, Palette, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from '../i18n/I18nContext';
import * as htmlToImage from 'html-to-image';
import { NODE_LIGHTSTEP, NODE_LEVELMAX, NODE_HUESIZE } from '../config';

export interface MapNode extends d3.SimulationNodeDatum {
  id: string;
  parentId: string | null;
  text: string;
  isRoot?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  diffStatus?: 'added' | 'deleted' | 'edited';
}

export interface MapLink extends d3.SimulationLinkDatum<MapNode> {
  source: MapNode | string;
  target: MapNode | string;
}

export interface MindMapData {
  nodes: { id: string; parentId: string | null; text: string; isRoot?: boolean; x?: number; y?: number; diffStatus?: 'added' | 'deleted' | 'edited' }[];
  links: { source: string; target: string }[];
  theme?: MindMapTheme;
  repulsion?: number;
  linkDistance?: number;
}

export interface MindMapTheme {
  l: number;
  c: number;
  h: number;
}

export interface MindMapProps {
  initialData?: MindMapData | null;
  onChange?: (data: MindMapData) => void;
  theme?: MindMapTheme;
  onThemeChange?: (theme: MindMapTheme) => void;
  mapId?: string | null;
  onSaveRequested?: () => void;
}

type Mode = 'select' | 'edit';

export default function MindMap({ initialData, onChange, theme, onThemeChange, mapId, onSaveRequested }: MindMapProps) {
  const { t, locale, setLocale } = useTranslation();

  // Graph Data (Refs to prevent physics re-renders)
  const nodesRef = useRef<MapNode[]>([]);
  const linksRef = useRef<MapLink[]>([]);
  const simulationRef = useRef<d3.Simulation<MapNode, MapLink> | null>(null);
  
  // Container & Zoom Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const exportContainerRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const configMenuRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<Element, unknown> | null>(null);
  
  // React State for UI
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nodesVersion, setNodesVersion] = useState(0); // For forcing React to re-render DOM list
  
  // Physics/Config State
  const [repulsion, setRepulsion] = useState(-1000);
  const [linkDistance, setLinkDistance] = useState(120);
  const [autoPan, setAutoPan] = useState(true);
  const [exportRatio, setExportRatio] = useState(1);
  const [exportQuality, setExportQuality] = useState(0.85);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const hasEdits = useMemo(() => {
    return nodesRef.current.some(n => Boolean(n.diffStatus));
  }, [nodesVersion]);

  // Theme Config State
  const [internalThemeL, setInternalThemeL] = useState(0.6);
  const [internalThemeC, setInternalThemeC] = useState(0.15);
  const [internalThemeH, setInternalThemeH] = useState(250);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const themeL = theme?.l ?? internalThemeL;
  const themeC = theme?.c ?? internalThemeC;
  const themeH = theme?.h ?? internalThemeH;

  const updateThemeL = (l: number) => {
    setInternalThemeL(l);
    onThemeChange?.({ l, c: themeC, h: themeH });
  };
  const updateThemeC = (c: number) => {
    setInternalThemeC(c);
    onThemeChange?.({ l: themeL, c, h: themeH });
  };
  const updateThemeH = (h: number) => {
    setInternalThemeH(h);
    onThemeChange?.({ l: themeL, c: themeC, h });
  };

  const LIGHTSTEP = NODE_LIGHTSTEP;
  const LEVELMAX = NODE_LEVELMAX;
  const HUESIZE = NODE_HUESIZE;

  const getNodeDepth = useCallback((nodeId: string): number => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node || !node.parentId) return 0;
    return 1 + getNodeDepth(node.parentId);
  }, []);

  const getNodeColor = useCallback((node: MapNode): string => {
    if (node.isRoot) {
      return `oklch(${themeL} ${themeC} ${themeH})`;
    }
    const depth = getNodeDepth(node.id);
    const hueShift = Math.floor(depth / LEVELMAX) * HUESIZE;
    const lightnessBoost = depth * LIGHTSTEP;
    const newL = Math.min(0.95, themeL + lightnessBoost);
    const newH = (themeH + hueShift) % 360;
    return `oklch(${newL} ${themeC} ${newH})`;
  }, [themeL, themeC, themeH, getNodeDepth, LEVELMAX, HUESIZE, LIGHTSTEP]);

  const getNodeTextColor = useCallback((node: MapNode): string => {
    const color = getNodeColor(node);
    const lMatch = color.match(/oklch\(([0-9.]+)/);
    const l = lMatch ? parseFloat(lMatch[1]) : themeL;
    return l > 0.7 ? 'oklch(0.2 0.05 ' + (themeH % 360) + ')' : '#ffffff';
  }, [getNodeColor, themeL, themeH]);

  // Theme / Color Computation
  const isLight = themeL > 0.7;
  const themeStyles = {
    '--theme-main': `oklch(${themeL} ${themeC} ${themeH})`,
    '--theme-main-hover': `oklch(${Math.max(0, themeL - 0.08)} ${themeC} ${themeH})`,
    '--theme-text-contrast': isLight ? `oklch(0.2 ${Math.min(0.05, themeC)} ${themeH})` : '#ffffff',
    '--theme-bg-soft': `oklch(0.98 ${Math.min(0.01, themeC)} ${themeH})`,
    '--theme-grid': `oklch(0.85 ${Math.min(0.05, themeC)} ${themeH})`,
    '--theme-border': `oklch(0.8 ${Math.min(0.05, themeC)} ${themeH})`,
    '--theme-border-hover': `oklch(0.6 ${Math.min(0.1, themeC)} ${themeH})`,
    '--theme-line': `oklch(0.75 ${Math.min(0.06, themeC)} ${themeH})`,
  } as React.CSSProperties & Record<string, string>;

  const handleExport = useCallback(async (format: 'png' | 'jpg' | 'svg' | 'webp') => {
    if (!exportContainerRef.current || !svgRef.current || !containerRef.current) return;
    try {
      let dataUrl;
      const exportBgColor = themeStyles['--theme-bg-soft'];

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodesRef.current.forEach(n => {
        if (n.x === undefined || n.y === undefined) return;
        // Approximate node bounds (assuming max 250px width and ~100px height for bounding box purposes)
        minX = Math.min(minX, n.x - 125);
        minY = Math.min(minY, n.y - 50);
        maxX = Math.max(maxX, n.x + 125);
        maxY = Math.max(maxY, n.y + 50);
      });

      if (minX === Infinity) {
        minX = 0; minY = 0; maxX = window.innerWidth; maxY = window.innerHeight;
      } else {
        const padding = 100;
        minX -= padding;
        minY -= padding;
        maxX += padding;
        maxY += padding;
      }

      const width = Math.ceil(maxX - minX);
      const height = Math.ceil(maxY - minY);

      const exportNode = exportContainerRef.current;
      const edgeGroup = document.getElementById('edge-group');
      const nodeGroup = document.getElementById('node-group');
      
      // Save original state
      const origClass = exportNode.className;
      const origWidth = exportNode.style.width;
      const origHeight = exportNode.style.height;
      const origOverflow = exportNode.style.overflow;
      const origTransform = exportNode.style.transform;
      
      const origEdgeTransform = edgeGroup?.getAttribute('transform');
      const origNodeTransform = nodeGroup?.style.transform;
      const origSvgWidth = svgRef.current.style.width;
      const origSvgHeight = svgRef.current.style.height;

      // Hide selection outlines & ui
      const selectedRings = nodeGroup?.querySelectorAll('.ring-2') || [];
      selectedRings.forEach(el => el.classList.remove('ring-2', 'ring-[var(--theme-main)]', 'ring-offset-2', 'z-10'));
      const buttons = nodeGroup?.querySelectorAll('button') || [];
      buttons.forEach(btn => btn.style.display = 'none');
      
      const hiddenUI = exportNode.querySelectorAll('[data-export-hide="true"]');
      const origUIDisplays: string[] = [];
      hiddenUI.forEach((el: any) => {
        origUIDisplays.push(el.style.display);
        el.style.display = 'none';
      });

      // Apply export bounds and positions directly to the live DOM
      exportNode.className = origClass.replace('h-screen', '').replace('w-full', '').replace('overflow-hidden', '');
      exportNode.style.width = `${width}px`;
      exportNode.style.height = `${height}px`;
      exportNode.style.overflow = 'visible';
      exportNode.style.transform = 'none'; // Ensure no parent transforms meddle

      svgRef.current.style.width = `${width}px`;
      svgRef.current.style.height = `${height}px`;
      
      if (edgeGroup) {
        edgeGroup.setAttribute('transform', `translate(${-minX}, ${-minY}) scale(1)`);
        edgeGroup.querySelectorAll('path').forEach((p: SVGElement) => p.style.stroke = themeStyles['--theme-line'] || '#000');
      }
      
      if (nodeGroup) {
        nodeGroup.style.transform = `translate(${-minX}px, ${-minY}px) scale(1)`;
      }

      const bgGrid = exportNode.querySelector('.opacity-40.bg-\\[radial-gradient\\(var\\(--theme-grid\\)_1px\\,transparent_1px\\)\\]') as HTMLElement;
      const origGridWidth = bgGrid?.style.width;
      const origGridHeight = bgGrid?.style.height;
      if (bgGrid) {
        bgGrid.style.width = width + 'px';
        bgGrid.style.height = height + 'px';
      }

      await new Promise(resolve => setTimeout(resolve, 150)); // let layout settle
      
      const pxRatio = exportRatio; // Use configured pixel ratio

      const opts = { 
        backgroundColor: exportBgColor,
        pixelRatio: pxRatio,
        width,
        height,
        style: {
          margin: '0',
          padding: '0',
          width: `${width}px`,
          height: `${height}px`
        }
      };
      
      if (format === 'png') {
          dataUrl = await htmlToImage.toPng(exportNode, opts);
      } else if (format === 'jpg') {
          dataUrl = await htmlToImage.toJpeg(exportNode, { ...opts, quality: exportQuality }); // Use configured quality
      } else if (format === 'webp') {
          const canvas = await htmlToImage.toCanvas(exportNode, opts);
          dataUrl = canvas.toDataURL('image/webp', exportQuality);
      } else {
          dataUrl = await htmlToImage.toSvg(exportNode, opts);
      }

      // Restore states
      exportNode.className = origClass;
      exportNode.style.width = origWidth;
      exportNode.style.height = origHeight;
      exportNode.style.overflow = origOverflow;
      exportNode.style.transform = origTransform;
      
      svgRef.current.style.width = origSvgWidth;
      svgRef.current.style.height = origSvgHeight;
      
      if (bgGrid) {
        bgGrid.style.width = origGridWidth || '';
        bgGrid.style.height = origGridHeight || '';
      }
      
      if (edgeGroup && origEdgeTransform) edgeGroup.setAttribute('transform', origEdgeTransform);
      if (nodeGroup && origNodeTransform) nodeGroup.style.transform = origNodeTransform;
      
      selectedRings.forEach(el => el.classList.add('ring-2', 'ring-[var(--theme-main)]', 'ring-offset-2', 'z-10'));
      buttons.forEach(btn => btn.style.display = '');

      hiddenUI.forEach((el: any, i) => {
        el.style.display = origUIDisplays[i];
      });

      const link = document.createElement('a');
      link.download = `mindmap-${Date.now()}.${format}`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Export failed', e);
    }
  }, [themeStyles]);

  // Initialize data
  useEffect(() => {
    if (!initialData || !initialData.nodes || initialData.nodes.length === 0) {
      if (!nodesRef.current.length) {
        const rootId = uuidv4();
        nodesRef.current = [
          { id: rootId, parentId: null, text: t('map.centralIdea'), isRoot: true, fx: 0, fy: 0 }
        ];
        linksRef.current = [];
        setSelectedId(nodesRef.current[0]?.id || null);
        setNodesVersion(v => v + 1);
      }
      return;
    }
    
    nodesRef.current = initialData.nodes.map((n: any) => {
      return { ...n, vx: 0, vy: 0, fx: n.isRoot ? 0 : null, fy: n.isRoot ? 0 : null };
    });
    linksRef.current = initialData.links.map((l: any) => ({
      source: l.source.id || l.source,
      target: l.target.id || l.target
    }));
    if (initialData.repulsion !== undefined) {
      setRepulsion(initialData.repulsion);
    }
    if (initialData.linkDistance !== undefined) {
      setLinkDistance(initialData.linkDistance);
    }
    setSelectedId(nodesRef.current[0]?.id || null);
    setNodesVersion(v => v + 1);
  }, [initialData]);

  // Report changes
  useEffect(() => {
    if (nodesRef.current.length === 0) return;
    const currentData = {
      nodes: nodesRef.current.map(n => ({ id: n.id, parentId: n.parentId, text: n.text, isRoot: n.isRoot, x: n.x, y: n.y, diffStatus: n.diffStatus })),
      links: linksRef.current.map(l => ({ 
        source: typeof l.source === 'object' ? l.source.id : l.source,
        target: typeof l.target === 'object' ? l.target.id : l.target
      })),
      repulsion,
      linkDistance
    };
    onChange?.(currentData);
  }, [nodesVersion, onChange, repulsion, linkDistance]);

  // Restart Simulation
  useEffect(() => {
    if (!nodesRef.current.length) return;

    if (simulationRef.current) {
      simulationRef.current.stop();
    }

    const sim = d3.forceSimulation<MapNode, MapLink>(nodesRef.current)
      .force('link', d3.forceLink<MapNode, MapLink>(linksRef.current).id(d => d.id).distance(linkDistance))
      .force('charge', d3.forceManyBody().strength(repulsion).distanceMax(800))
      .force('collide', d3.forceCollide().radius(60).iterations(2))
      .alphaDecay(0.02);

    sim.on('tick', () => {
      // Direct DOM manipulation for fast rendering
      nodesRef.current.forEach(node => {
        const el = document.getElementById(`node-${node.id}`);
        if (el && node.x !== undefined && node.y !== undefined) {
          el.style.transform = `translate(calc(-50% + ${node.x}px), calc(-50% + ${node.y}px))`;
        }
      });
      linksRef.current.forEach((link: any) => {
        const el = document.getElementById(`link-${link.source.id}-${link.target.id}`);
        if (el && link.source.x !== undefined && link.target.x !== undefined) {
          // Use straight lines to accommodate radial physics gracefully
          const pathObj = `M${link.source.x},${link.source.y} L${link.target.x},${link.target.y}`;
          el.setAttribute('d', pathObj);
        }
      });
    });

    simulationRef.current = sim;

    return () => sim.stop();
  }, [nodesVersion, repulsion, linkDistance]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (exportMenuRef.current?.contains(target)) return;
      if (themeMenuRef.current?.contains(target)) return;
      if (configMenuRef.current?.contains(target)) return;
      setIsExportOpen(false);
      setIsThemeOpen(false);
      setIsConfigOpen(false);
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  // Handle Zoom and Pan Setup
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 3])
      .on('zoom', (e) => {
        // Apply transform to the inner G containing edges and the div wrapper containing HTML nodes
        d3.select('#edge-group').attr('transform', e.transform);
        const nodeContainer = document.getElementById('node-group');
        if (nodeContainer) {
          nodeContainer.style.transform = `translate(${e.transform.x}px, ${e.transform.y}px) scale(${e.transform.k})`;
        }
      });
      
    d3.select(svgRef.current).call(zoom as any).on("dblclick.zoom", null);
    zoomBehaviorRef.current = zoom as any;

    // Initial positioning
    const initialTransform = d3.zoomIdentity.translate(window.innerWidth / 2, window.innerHeight / 2);
    d3.select(svgRef.current).call(zoom.transform as any, initialTransform);

  }, []);

  const panToNode = useCallback((nodeId: string) => {
    if (!autoPan || !zoomBehaviorRef.current || !svgRef.current) return;
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node || node.x === undefined || node.y === undefined) return;

    const currentTransform = d3.zoomTransform(svgRef.current);
    const k = currentTransform.k;
    
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    
    const x = cw / 2 - node.x * k;
    const y = ch / 2 - node.y * k;

    d3.select(svgRef.current).transition().duration(500)
      .call(zoomBehaviorRef.current.transform as any, d3.zoomIdentity.translate(x, y).scale(k));
  }, [autoPan]);

  const fitView = useCallback(() => {
    if (!zoomBehaviorRef.current || !svgRef.current || !nodesRef.current.length) return;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodesRef.current.forEach(n => {
      if (n.x === undefined || n.y === undefined) return;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });

    const padding = 100;
    const dx = maxX - minX;
    const dy = maxY - minY;
    let k = 1;
    if (dx > 0 && dy > 0) {
      k = Math.max(0.2, Math.min(2, 0.9 / Math.max(dx / cw, dy / ch)));
    }
    
    const x = cw / 2 - (minX + dx / 2) * k;
    const y = ch / 2 - (minY + dy / 2) * k;

    d3.select(svgRef.current).transition().duration(750)
      .call(zoomBehaviorRef.current.transform as any, d3.zoomIdentity.translate(x, y).scale(k));
  }, []);

  // Update selection
  const changeSelection = useCallback((id: string) => {
    setSelectedId(id);
    if (autoPan) panToNode(id);
  }, [autoPan, panToNode]);

  // Operations
  const addNode = (parentId: string, asSibling: boolean = false) => {
    const parentNode = nodesRef.current.find(n => n.id === parentId);
    if (!parentNode || parentNode.diffStatus === 'deleted') return;

    const actualParentId = asSibling && parentNode.parentId ? parentNode.parentId : parentNode.id;
    const nodeParent = nodesRef.current.find(n => n.id === actualParentId);
    if (!nodeParent || nodeParent.diffStatus === 'deleted') return;

    const id = uuidv4();
    const px = nodeParent.x || 0;
    const py = nodeParent.y || 0;
    const dx = asSibling ? 0 : 50;
    const dy = asSibling ? 50 : 0;

    const newNode: MapNode = {
      id,
      parentId: actualParentId,
      text: t('map.newNode'),
      x: px + dx,
      y: py + dy,
      diffStatus: 'added'
    };

    nodesRef.current.push(newNode);
    linksRef.current.push({ source: actualParentId, target: id });

    setNodesVersion(v => v + 1);
    changeSelection(id);

    setTimeout(() => setEditingId(id), 50);
    if (simulationRef.current) {
      simulationRef.current.alpha(0.5).restart();
    }
  };

  const deleteNode = (id: string) => {
    const node = nodesRef.current.find(n => n.id === id);
    if (!node || node.isRoot || node.diffStatus === 'deleted') return; // Cannot delete root

    // Find children
    const getChildrenRecursively = (nId: string): string[] => {
      const currentChildren = nodesRef.current.filter(n => n.parentId === nId).map(n => n.id);
      return [...currentChildren, ...currentChildren.flatMap(getChildrenRecursively)];
    };

    const toDelete = new Set([id, ...getChildrenRecursively(id)]);

    // Separate truly new nodes (added) from existing nodes that need marking as deleted
    const toRemove: string[] = []; // added nodes to completely remove
    const toMarkDeleted: string[] = []; // existing nodes to mark as deleted

    nodesRef.current.forEach(n => {
      if (toDelete.has(n.id)) {
        if (n.diffStatus === 'added') {
          toRemove.push(n.id);
        } else {
          toMarkDeleted.push(n.id);
        }
      }
    });

    // Remove completely new nodes (they were never saved)
    nodesRef.current = nodesRef.current.filter(n => !toRemove.includes(n.id));
    // Remove links associated with removed nodes
    linksRef.current = linksRef.current.filter(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return !toRemove.includes(srcId) && !toRemove.includes(tgtId);
    });

    // Mark existing nodes as deleted
    nodesRef.current.forEach(n => {
      if (toMarkDeleted.includes(n.id)) {
        n.diffStatus = 'deleted';
      }
    });

    const newSelectedId = node.parentId || nodesRef.current[0]?.id || null;

    setNodesVersion(v => v + 1);

    // Delay selection change to ensure DOM updates first
    setTimeout(() => {
      setSelectedId(newSelectedId);
      if (autoPan && newSelectedId) {
        panToNode(newSelectedId);
      }
      if (simulationRef.current) {
        simulationRef.current.alpha(0.3).restart();
      }
    }, 0);
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key === 'Enter') {
          e.preventDefault();
          setEditingId(null);
        } else if (e.key === 'Escape') {
          setEditingId(null);
        }
        return;
      }

      if (!selectedId) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        addNode(selectedId, true);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        addNode(selectedId, false);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        deleteNode(selectedId);
      } else if (e.key === ' ' || e.key === 'F2') {
        e.preventDefault();
        setEditingId(selectedId);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();

        const currNode = nodesRef.current.find(n => n.id === selectedId);
        if (!currNode) return;

        // Visual navigation logic
        if (e.key === 'ArrowRight') {
            // Find a child
            const children = nodesRef.current.filter(n => n.parentId === currNode.id);
            if(children.length > 0) changeSelection(children[Math.floor(children.length / 2)].id);
        } else if (e.key === 'ArrowLeft') {
            // Find parent
            if (currNode.parentId) changeSelection(currNode.parentId);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Find siblings
            if (currNode.parentId) {
                const siblings = nodesRef.current.filter(n => n.parentId === currNode.parentId);
                // Sort siblings vertically to ensure predictable navigation
                siblings.sort((a, b) => (a.y || 0) - (b.y || 0));
                const index = siblings.findIndex(s => s.id === selectedId);
                if (e.key === 'ArrowUp' && index > 0) {
                    changeSelection(siblings[index - 1].id);
                } else if (e.key === 'ArrowDown' && index < siblings.length - 1) {
                    changeSelection(siblings[index + 1].id);
                }
            }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, changeSelection]);

  const updateNodeText = (id: string, text: string) => {
    const node = nodesRef.current.find(n => n.id === id);
    if (node) {
      if (node.text !== text && node.diffStatus !== 'added') {
        node.diffStatus = 'edited';
      }
      node.text = text;
      setNodesVersion(v => v + 1); // trigger rerender of text
    }
  };



  return (
    <div ref={exportContainerRef} className="w-full h-screen overflow-hidden relative bg-[var(--theme-bg-soft)]" style={themeStyles}>
      {/* Background Dots Canvas */}
      <div className="absolute inset-0 z-0 opacity-40 bg-[radial-gradient(var(--theme-grid)_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* SVG for Edges & Zooming */}
      <svg 
        ref={svgRef} 
        className="absolute inset-0 w-full h-full z-10 cursor-grab active:cursor-grabbing"
      >
        <g id="edge-group">
          {linksRef.current.map((link: any, i) => (
            <path
              key={`link-${link.source.id || link.source}-${link.target.id || link.target}-${i}`}
              id={`link-${link.source.id || link.source}-${link.target.id || link.target}`}
              className="fill-none stroke-[2.5px] transition-colors"
              style={{ stroke: 'var(--theme-line)' }}
            />
          ))}
        </g>
      </svg>

      {/* HTML Nodes Wrapper */}
      <div 
        ref={containerRef}
        className="absolute inset-0 z-20 pointer-events-none origin-top-left"
      >
        <div id="node-group" className="absolute top-0 left-0 w-full h-full pointer-events-none origin-top-left">
          {nodesRef.current.map(node => (
            <div
              key={node.id}
              id={`node-${node.id}`}
              className={cn("absolute pointer-events-auto transition-shadow", node.diffStatus === 'deleted' && "opacity-40 grayscale")}
              style={{
                transform: `translate(calc(-50% + ${node.x || 0}px), calc(-50% + ${node.y || 0}px))`
              }}
              onClick={(e) => {
                if (node.diffStatus === 'deleted') return;
                e.stopPropagation();
                changeSelection(node.id);
              }}
              onDoubleClick={(e) => {
                if (node.diffStatus === 'deleted') return;
                e.stopPropagation();
                changeSelection(node.id);
                setEditingId(node.id);
              }}
            >
              <div
                className={cn(
                  "relative group px-5 py-2.5 rounded-xl text-sm font-semibold tracking-wide shadow-sm border-2 select-none whitespace-nowrap min-w-[80px] text-center",
                  "transition-all duration-200",
                  node.diffStatus === 'added'
                    ? "bg-emerald-400 border-emerald-400 text-emerald-950 shadow-xl"
                    : node.diffStatus === 'edited'
                      ? "bg-[var(--theme-main)] border-amber-400 text-[var(--theme-text-contrast)]"
                      : node.isRoot
                        ? "shadow-xl scale-105"
                        : "hover:shadow-lg cursor-pointer",
                  selectedId === node.id
                    ? "ring-2 ring-offset-2 ring-offset-[var(--theme-bg-soft)] border-transparent z-10"
                    : ""
                )}
                style={{
                  backgroundColor: node.diffStatus === 'added' || node.diffStatus === 'edited' ? undefined : getNodeColor(node),
                  borderColor: node.diffStatus === 'added' || node.diffStatus === 'edited' ? undefined : getNodeColor(node),
                  color: node.diffStatus === 'added' || node.diffStatus === 'edited' ? undefined : getNodeTextColor(node),
                }}
              >
                {editingId === node.id ? (
                  <input
                    autoFocus
                    className="w-full bg-transparent outline-none text-center min-w-[80px]"
                    value={node.text}
                    onChange={(e) => updateNodeText(node.id, e.target.value)}
                    onBlur={() => setEditingId(null)}
                    onFocus={(e) => e.target.select()}
                    size={Math.max(node.text.length, 5)}
                  />
                ) : (
                  <span>{node.text}</span>
                )}
                
                {/* Visual Add Button on hover */}
                {node.diffStatus !== 'deleted' && (
                  <button
                    onClick={(e) => {
                        e.stopPropagation();
                        addNode(node.id, false);
                    }}
                    className={cn(
                      "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[var(--theme-main)] border-2 border-white text-[var(--theme-text-contrast)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-md",
                      selectedId === node.id ? "opacity-100" : ""
                    )}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar - UI terminology: Button Group or Segmented Control */}
      <div ref={toolbarRef} className="absolute top-6 left-6 z-30 flex gap-2 items-start relative" data-export-hide="true">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-1.5 flex gap-1 h-fit">
          <button onClick={fitView} className="p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg transition-colors tooltip" title={t('toolbar.fitToScreen')}>
            <Maximize size={18} />
          </button>
          <button onClick={() => selectedId && panToNode(selectedId)} className="p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg transition-colors tooltip" title={t('toolbar.focusNode')}>
            <Target size={18} />
          </button>
          <div className="w-[1px] h-6 bg-zinc-200 my-auto mx-1"></div>
          <button
            onClick={(e) => { e.stopPropagation(); setIsThemeOpen(!isThemeOpen); setIsConfigOpen(false); setIsExportOpen(false); }}
            className="p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg transition-colors tooltip"
            title={t('toolbar.themeSettings')}
          >
            <Palette size={18} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsExportOpen(!isExportOpen); setIsConfigOpen(false); setIsThemeOpen(false); }}
            className="p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 rounded-lg transition-colors tooltip"
            title={t('toolbar.exportImage')}
          >
            <Download size={18} />
          </button>
        </div>

        <AnimatePresence>
          {isExportOpen && (
            <motion.div
              ref={exportMenuRef}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 mt-3 bg-white rounded-2xl shadow-xl border border-zinc-200 p-2 w-48 flex flex-col gap-1 overflow-hidden pointer-events-auto"
            >
              <button onClick={() => { handleExport('png'); setIsExportOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 text-sm font-medium text-zinc-700 rounded-lg transition-colors">
                {t('export.png')}
              </button>
              <button onClick={() => { handleExport('webp'); setIsExportOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 text-sm font-medium text-zinc-700 rounded-lg transition-colors">
                {t('export.webp')}
              </button>
              <button onClick={() => { handleExport('jpg'); setIsExportOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 text-sm font-medium text-zinc-700 rounded-lg transition-colors">
                {t('export.jpg')}
              </button>
              <button onClick={() => { handleExport('svg'); setIsExportOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-zinc-50 text-sm font-medium text-zinc-700 rounded-lg transition-colors">
                {t('export.svg')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isThemeOpen && (
            <motion.div
              ref={themeMenuRef}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 mt-3 bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-80 flex flex-col gap-5 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-[var(--theme-main)]" />
              <h3 className="font-semibold text-zinc-900 text-lg">{t('theme.colors')}</h3>
              
              <div className="space-y-4">
                {/* Lightness */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium text-zinc-600">
                    <span>{t('theme.lightness')}</span>
                    <input 
                      type="number" min="0" max="1" step="0.01" 
                      value={themeL} 
                      onChange={(e) => updateThemeL(parseFloat(e.target.value) || 0)}
                      className="w-16 p-1 text-right border border-zinc-200 rounded font-mono text-xs focus:outline-none focus:border-[var(--theme-main)]"
                    />
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.01"
                    value={themeL}
                    onChange={(e) => updateThemeL(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--theme-main)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                </div>

                {/* Chroma */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium text-zinc-600">
                    <span>{t('theme.chroma')}</span>
                    <input 
                      type="number" min="0" max="0.4" step="0.01" 
                      value={themeC} 
                      onChange={(e) => updateThemeC(parseFloat(e.target.value) || 0)}
                      className="w-16 p-1 text-right border border-zinc-200 rounded font-mono text-xs focus:outline-none focus:border-[var(--theme-main)]"
                    />
                  </div>
                  <input 
                    type="range" min="0" max="0.3" step="0.01"
                    value={themeC}
                    onChange={(e) => updateThemeC(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--theme-main)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                </div>

                {/* Hue */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium text-zinc-600">
                    <span>{t('theme.hue')}</span>
                    <input 
                      type="number" min="0" max="360" step="1" 
                      value={themeH} 
                      onChange={(e) => updateThemeH(parseFloat(e.target.value) || 0)}
                      className="w-16 p-1 text-right border border-zinc-200 rounded font-mono text-xs focus:outline-none focus:border-[var(--theme-main)]"
                    />
                  </div>
                  <input 
                    type="range" min="0" max="360" step="1"
                    value={themeH}
                    onChange={(e) => updateThemeH(parseFloat(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-zinc-800 [&::-webkit-slider-thumb]:rounded-full cursor-pointer shadow-inner"
                    style={{
                      background: `linear-gradient(to right, 
                        oklch(${themeL} ${themeC} 0), 
                        oklch(${themeL} ${themeC} 60), 
                        oklch(${themeL} ${themeC} 120), 
                        oklch(${themeL} ${themeC} 180), 
                        oklch(${themeL} ${themeC} 240), 
                        oklch(${themeL} ${themeC} 300), 
                        oklch(${themeL} ${themeC} 360)
                      )`
                    }}
                  />
                </div>
                
                {/* Preview Swatch */}
                <div className="mt-2 h-10 w-full rounded-xl border border-black/10 flex items-center justify-center font-medium text-[var(--theme-text-contrast)] shadow-inner" style={{ backgroundColor: 'var(--theme-main)' }}>
                  {t('theme.preview')}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Configuration Toggle */}
      <div className="absolute top-6 right-6 z-30 flex flex-col items-end gap-2" data-export-hide="true">
        {hasEdits && (
          <button 
            onClick={onSaveRequested}
            className="bg-[var(--theme-main)] border border-transparent text-[var(--theme-text-contrast)] rounded-xl shadow-md p-2 hover:brightness-110 transition-all flex items-center justify-center font-bold text-sm px-6 h-[42px] animate-in slide-in-from-top-4 fade-in duration-300"
          >
            {t('map.save')}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setIsConfigOpen(!isConfigOpen); setIsThemeOpen(false); setIsExportOpen(false); }}
          className="bg-white rounded-xl shadow-sm border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all flex items-center gap-2 font-medium text-sm px-4 h-[42px]"
        >
          <Settings size={18} />
          {t('config.settings')}
        </button>

        <AnimatePresence>
          {isConfigOpen && (
            <motion.div
              ref={configMenuRef}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="mt-3 bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-80 flex flex-col gap-5 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-[var(--theme-main)]" />
              
              <h3 className="font-semibold text-zinc-900 text-lg">{t('config.layout')}</h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium text-zinc-600">
                    <span>{t('config.repulsion')}</span>
                    <span>{Math.abs(repulsion)}</span>
                  </div>
                  <input 
                    type="range" 
                    min="100" max="3000" step="100"
                    value={Math.abs(repulsion)}
                    onChange={(e) => setRepulsion(-parseInt(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--theme-main)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                  <p className="text-xs text-zinc-400">{t('config.repulsionDesc')}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-medium text-zinc-600">
                    <span>{t('config.linkLength')}</span>
                    <span>{linkDistance}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="50" max="300" step="10"
                    value={linkDistance}
                    onChange={(e) => setLinkDistance(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--theme-main)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                  <p className="text-xs text-zinc-400">{t('config.linkLengthDesc')}</p>
                </div>

                <div className="flex items-center justify-between pt-2 pb-4 border-b border-zinc-100">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => setAutoPan(!autoPan)}>
                    <div className={cn(
                      "w-10 h-6 rounded-full flex items-center p-1 transition-colors",
                      autoPan ? "bg-[var(--theme-main)]" : "bg-zinc-300"
                    )}>
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                        autoPan ? "translate-x-4" : "translate-x-0"
                      )} />
                    </div>
                    <span className="text-sm font-medium text-zinc-800">{t('config.autoFocus')}</span>
                  </div>
                </div>

                {/* Export Settings */}
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mt-2">
                  {t('config.export')}
                </h3>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium text-zinc-600">
                    <span>{t('config.exportRatio')}</span>
                    <span>{exportRatio}x</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" max="3" step="0.5"
                    value={exportRatio}
                    onChange={(e) => setExportRatio(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--theme-main)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                  <p className="text-xs text-zinc-400">{t('config.exportRatioDesc')}</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium text-zinc-600">
                    <span>{t('config.exportQuality')}</span>
                    <span>{Math.round(exportQuality * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" max="1" step="0.05"
                    value={exportQuality}
                    onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--theme-main)] [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
                  />
                  <p className="text-xs text-zinc-400">{t('config.exportQualityDesc')}</p>
                </div>

                {/* Language Switch */}
                <div className="flex items-center justify-between pt-4 border-t border-zinc-100 mt-2">
                  <span className="text-sm font-medium text-zinc-800">{t('config.language')}</span>
                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => setLocale('en')}
                      className={cn("px-2 py-1 text-xs rounded-md shadow-sm border transition-colors cursor-pointer", locale === 'en' ? "bg-[var(--theme-main)] border-[var(--theme-main)] text-[var(--theme-text-contrast)]" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50")}
                    >
                      EN
                    </button>
                    <button 
                      onClick={() => setLocale('zh')}
                      className={cn("px-2 py-1 text-xs rounded-md shadow-sm border transition-colors cursor-pointer", locale === 'zh' ? "bg-[var(--theme-main)] border-[var(--theme-main)] text-[var(--theme-text-contrast)]" : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50")}
                    >
                      ZH
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Keyboard hints */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-zinc-200 flex gap-6 text-xs font-semibold text-zinc-500" data-export-hide="true">
        <span className="flex items-center gap-1.5"><kbd className="bg-zinc-100 rounded px-1.5 py-0.5 border border-zinc-300 text-zinc-800">Tab</kbd> {t('hints.child')}</span>
        <span className="flex items-center gap-1.5"><kbd className="bg-zinc-100 rounded px-1.5 py-0.5 border border-zinc-300 text-zinc-800">Enter</kbd> {t('hints.sibling')}</span>
        <span className="flex items-center gap-1.5"><kbd className="bg-zinc-100 rounded px-1.5 py-0.5 border border-zinc-300 text-zinc-800">Space</kbd> {t('hints.edit')}</span>
        <span className="flex items-center gap-1.5"><kbd className="bg-zinc-100 rounded px-1.5 py-0.5 border border-zinc-300 text-zinc-800">Del</kbd> {t('hints.delete')}</span>
      </div>
    </div>
  );
}
