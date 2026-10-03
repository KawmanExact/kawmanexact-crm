'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const { className, ...restProps } = props
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl text-white shadow-xl',
          className
        )}
        {...restProps}
      />
    )
  }
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const { className, ...restProps } = props
    return (
      <div
        ref={ref}
        className={cn('flex flex-col space-y-1.5 p-6', className)}
        {...restProps}
      />
    )
  }
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  (props, ref) => {
    const { className, ...restProps } = props
    return (
      <h3
        ref={ref}
        className={cn('text-xl font-semibold leading-none tracking-tight', className)}
        {...restProps}
      />
    )
  }
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  (props, ref) => {
    const { className, ...restProps } = props
    return (
      <p
        ref={ref}
        className={cn('text-sm text-white/60', className)}
        {...restProps}
      />
    )
  }
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const { className, ...restProps } = props
    return (
      <div ref={ref} className={cn('p-6 pt-0', className)} {...restProps} />
    )
  }
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => {
    const { className, ...restProps } = props
    return (
      <div
        ref={ref}
        className={cn('flex items-center p-6 pt-0', className)}
        {...restProps}
      />
    )
  }
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
