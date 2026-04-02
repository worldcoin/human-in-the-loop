'use client'

import { cn } from '@/lib/utils'
import { Streamdown } from 'streamdown'
import { type ComponentProps, memo } from 'react'

type ResponseProps = ComponentProps<typeof Streamdown>

export const Response = memo(
	({ className, ...props }: ResponseProps) => (
		<Streamdown className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)} {...props} />
	),
	(prevProps, nextProps) => prevProps.children === nextProps.children
)

Response.displayName = 'Response'
