export function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export const ChatIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
);

export const CardIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M2 10h20" />
);

export const QuizIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
);

export const KeyIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M21 2l-2 2 m-7.6 7.6a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L19 3m-3 3 3 3" />
);

export const BookIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z" />
);

export const SparkIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
);

export const BagIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M6 7h12l1 14H5z M9 7a3 3 0 0 1 6 0" />
);

export const UploadIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size} d="M12 16V4 m0 0l-4 4 m4-4l4 4 M4 20h16" />
);
