import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignEndHorizontalIcon,
  AlignEndVerticalIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignHorizontalSpaceBetweenIcon,
  AlignStartHorizontalIcon,
  AlignStartVerticalIcon,
  AlignVerticalDistributeCenterIcon,
  AlignVerticalSpaceBetweenIcon,
  BoxSelectIcon,
  CameraIcon,
  ChevronLeftIcon,
  CircleIcon,
  CopyIcon,
  EllipsisIcon,
  FileTextIcon,
  FileUpIcon,
  GroupIcon,
  KeyboardIcon,
  MapPinIcon,
  MoveIcon,
  PlayIcon,
  RectangleHorizontalIcon,
  RulerIcon,
  ScanIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StepForwardIcon,
  TrendingUpIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  UngroupIcon,
  Redo2Icon,
  type LucideIcon,
} from 'lucide-react';

/** Line icons (24 × 24, stroke = currentColor). Always shown next to a text label. */
const PATHS = {
  drive:
    'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  job: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  machine: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  play: 'M8 5l11 7-11 7z',
  step: 'M6 5l8 7-8 7zM17 5v14',
  frame: 'M4 4h16v16H4zM4 9h3M17 9h3M9 4v3M9 17v3',
  zero: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 100 8 4 4 0 000-8z',
  tool: 'M9 2h6v8H9zM10 10v8l2 4 2-4v-8M10 13l4 2M10 16l4 2',
  feed: 'M12 5v14M5 12h14',
  spindle:
    'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 3v5M12 16v5M3 12h5M16 12h5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  deviation: 'M3 17l5-5 4 4 8-8M15 8h5v5',
  camera: 'M4 7h4l2-3h4l2 3h4v12H4zM12 10a3 3 0 100 6 3 3 0 000-6z',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  follow: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 100 8 4 4 0 000-8z',
  rapid: 'M2 12h4M10 12h4M18 12h4',
  goto: 'M12 21s-6-5.4-6-10a6 6 0 1112 0c0 4.6-6 10-6 10zM12 9a2 2 0 100 4 2 2 0 000-4z',
  edge: 'M4 19h16M4 19L17 6M11.5 19a7.5 7.5 0 00-2.2-5.3',
  measure: 'M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4',
  clamp: 'M6 4h11v4H10v8h7v4H6zM14 8v2M14 14v2M17 10h4M17 14h4',
  stick: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 9a3 3 0 100 6 3 3 0 000-6z',
  back: 'M15 5l-7 7 7 7',
  wide: 'M4 5h16v14H4zM9 9l-3 3 3 3M15 9l3 3-3 3',
  rect: 'M4 6h16v12H4z',
  circle: 'M12 4a8 8 0 100 16 8 8 0 000-16z',
  slot: 'M8 8h8a4 4 0 010 8H8a4 4 0 010-8z',
  grid: 'M7 5a2 2 0 100 4 2 2 0 000-4zM17 5a2 2 0 100 4 2 2 0 000-4zM7 15a2 2 0 100 4 2 2 0 000-4zM17 15a2 2 0 100 4 2 2 0 000-4z',
  text: 'M5 6h14M12 6v13M9 19h6',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5M12 18v-6M9.5 14.5L12 12l2.5 2.5',
  undo: 'M8 5L3 10l5 5M3 10h11a5.5 5.5 0 010 11h-3',
  redo: 'M16 5l5 5-5 5M21 10H10a5.5 5.5 0 000 11h3',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  search: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L20 20',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8zM8.5 12h7',
  alignLeft: 'M4 3v18M8 6h12v4H8zM8 14h7v4H8z',
  alignCentre: 'M12 3v18M5 6h14v4H5zM8 14h8v4H8z',
  alignRight: 'M20 3v18M4 6h12v4H4zM9 14h7v4H9z',
  alignTop: 'M3 4h18M6 8h4v12H6zM14 8h4v7h-4z',
  alignMiddle: 'M3 12h18M6 5h4v14H6zM14 8h4v8h-4z',
  alignBottom: 'M3 20h18M6 4h4v12H6zM14 9h4v7h-4z',
  spreadH: 'M4 3v18M20 3v18M9 7h6v10H9z',
  centresH: 'M3 12h18M6 8h3v8H6zM15 8h3v8h-3z',
  spreadV: 'M3 4h18M3 20h18M7 9h10v6H7z',
  centresV: 'M12 3v18M8 6h8v3H8zM8 15h8v3H8z',
  group: 'M3 5h6v6H3zM15 13h6v6h-6zM6 14v5h5M18 10V5h-5',
  ungroup: 'M3 5h6v6H3zM15 13h6v6h-6z',
  select: 'M4 4h3M10 4h4M17 4h3M4 20h3M10 20h4M17 20h3M4 4v16M20 4v16',
} as const;

export type IconName = keyof typeof PATHS;

/**
 * Where Lucide has the same sign, it is Lucide's (DESIGN.md §7: one icon
 * family). The rest are this app's own: a cutter, a clamp, the frame run,
 * a slot – things of the workshop Lucide does not draw.
 */
const LUCIDE: Partial<Record<IconName, LucideIcon>> = {
  drive: MoveIcon,
  job: FileTextIcon,
  machine: SlidersHorizontalIcon,
  play: PlayIcon,
  step: StepForwardIcon,
  camera: CameraIcon,
  fit: ScanIcon,
  goto: MapPinIcon,
  measure: RulerIcon,
  back: ChevronLeftIcon,
  rect: RectangleHorizontalIcon,
  circle: CircleIcon,
  text: TypeIcon,
  file: FileUpIcon,
  undo: Undo2Icon,
  redo: Redo2Icon,
  trash: Trash2Icon,
  copy: CopyIcon,
  search: SearchIcon,
  keyboard: KeyboardIcon,
  more: EllipsisIcon,
  deviation: TrendingUpIcon,
  alignLeft: AlignStartVerticalIcon,
  alignCentre: AlignCenterVerticalIcon,
  alignRight: AlignEndVerticalIcon,
  alignTop: AlignStartHorizontalIcon,
  alignMiddle: AlignCenterHorizontalIcon,
  alignBottom: AlignEndHorizontalIcon,
  spreadH: AlignHorizontalSpaceBetweenIcon,
  centresH: AlignHorizontalDistributeCenterIcon,
  spreadV: AlignVerticalSpaceBetweenIcon,
  centresV: AlignVerticalDistributeCenterIcon,
  group: GroupIcon,
  ungroup: UngroupIcon,
  select: BoxSelectIcon,
};

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const Lucide = LUCIDE[name];
  if (Lucide) return <Lucide className="icon" size={size} strokeWidth={1.8} aria-hidden="true" />;
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
