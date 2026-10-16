import {
  AudioLines,
  Backpack,
  BookOpen,
  KeyRound,
  Layers,
  ListChecks,
  MessageCircle,
  Sparkles,
  Upload,
  type LucideProps,
} from "lucide-react";

function wrap(Icon: (p: LucideProps) => React.ReactNode) {
  return function Wrapped({ size = 20 }: { size?: number }) {
    return <Icon size={size} strokeWidth={2} aria-hidden />;
  };
}

export const ChatIcon = wrap(MessageCircle);
export const CardIcon = wrap(Layers);
export const QuizIcon = wrap(ListChecks);
export const KeyIcon = wrap(KeyRound);
export const BookIcon = wrap(BookOpen);
export const SparkIcon = wrap(Sparkles);
export const BagIcon = wrap(Backpack);
export const UploadIcon = wrap(Upload);
export const PodIcon = wrap(AudioLines);
