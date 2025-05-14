import Image from 'next/image';
import { GalleryThumbnails } from 'lucide-react';
import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

// Define discrete sizes for the icon itself
const iconSizeClasses: Record<number, string> = {
  8: 'h-8 w-8',   // 32px
  10: 'h-10 w-10', // 40px
  12: 'h-12 w-12', // 48px
};

// Define discrete sizes for the text
const textSizeClasses: Record<number, string> = {
  8: 'text-2xl',  // Matched to h-8 icon
  10: 'text-3xl', // Matched to h-10 icon
  12: 'text-4xl', // Matched to h-12 icon
}

export function AppLogo(props: { baseSize?: number; withText?: boolean; className?: string }) {
  const { baseSize = 8, withText = true, className } = props;
  const currentIconSizeClass = iconSizeClasses[baseSize] || iconSizeClasses[8];
  const currentTextSizeClass = textSizeClasses[baseSize] || textSizeClasses[8];
  const sizePx = baseSize === 12 ? 48 : baseSize === 10 ? 40 : 32;

  return (
    <div className="flex items-center gap-2">
      <Image
        src="/images/logo.png"
        alt="ThumbBlitz AI Logo"
        width={sizePx}
        height={sizePx}
        className={cn(currentIconSizeClass, className)}
        priority
      />
      {withText && (
        <h1 className={cn(
          currentTextSizeClass,
          'font-bold text-foreground tracking-tighter'
        )}>
          ThumbBlitz AI
        </h1>
      )}
    </div>
  );
}

