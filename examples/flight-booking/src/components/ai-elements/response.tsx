'use client'

import { cn } from '@/lib/utils'
import { Streamdown } from 'streamdown'
import { type ComponentProps, memo } from 'react'

type ResponseProps = ComponentProps<typeof Streamdown>

export const Response = memo(
	({ className, ...props }: ResponseProps) => (
		<Streamdown
			className={cn(
				'size-full leading-7 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_a]:font-medium [&_a]:text-sky-300 [&_a]:underline [&_a]:decoration-sky-300/50 [&_a]:underline-offset-4 [&_a:hover]:text-sky-200 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-sky-300',
				className
			)}
			{...props}
		/>
	),
	(prevProps, nextProps) => prevProps.children === nextProps.children
)

Response.displayName = 'Response'
