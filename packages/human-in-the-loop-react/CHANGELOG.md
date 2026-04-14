# @worldcoin/human-in-the-loop-react

## 0.1.0

### Minor Changes

- Initial release. Ships `<HumanApproval>` component and `useHumanApproval` hook for rendering the World ID approval flow on the client. Reads the streamed `data-approval-context` chunk from the server, drives `IDKitRequestWidget`, and POSTs the proof back to the webhook. Reads `app_id` from `NEXT_PUBLIC_WORLD_APP_ID` by default; everything else is configurable via props or via the headless hook.
