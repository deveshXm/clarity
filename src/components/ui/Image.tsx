import { forwardRef } from 'react';
import NextImage, { ImageProps as NextImageProps } from 'next/image';

export const Image = forwardRef<HTMLImageElement, NextImageProps>((props, ref) => {
  return <NextImage ref={ref} {...props} />;
});

Image.displayName = 'Image'; 