
'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  href?: string;
  label?: string;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg';
  showIcon?: boolean;
}

export function BackButton({ 
  href, 
  label = 'Back',
  onClick,
  className,
  variant = 'ghost',
  size = 'default',
  showIcon = true
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (!href) {
      router.back();
    }
  };

  const buttonContent = (
    <>
      {showIcon && (
        <ArrowLeft className={cn(
          'transition-transform group-hover:-translate-x-1',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
          label && 'mr-2'
        )} />
      )}
      {label}
    </>
  );

  const buttonClasses = cn(
    'group font-medium transition-all duration-200',
    'hover:shadow-md hover:scale-105',
    'focus:ring-2 focus:ring-offset-2 focus:ring-blue-500',
    variant === 'default' && 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white',
    variant === 'ghost' && 'hover:bg-blue-50 hover:text-blue-700',
    variant === 'outline' && 'border-2 hover:bg-blue-50 hover:border-blue-500 hover:text-blue-700',
    className
  );

  if (href) {
    return (
      <Button 
        asChild 
        variant={variant} 
        size={size}
        className={buttonClasses}
      >
        <Link href={href}>
          {buttonContent}
        </Link>
      </Button>
    );
  }

  return (
    <Button 
      variant={variant} 
      size={size}
      onClick={handleClick}
      className={buttonClasses}
    >
      {buttonContent}
    </Button>
  );
}
