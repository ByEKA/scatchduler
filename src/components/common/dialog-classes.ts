// Spec §6.7 overlay and §6.11 dialog motion, shared by the form dialogs and the confirmations
// (AlertDialogs). The generated content components zoom from 95 % with the default easing.
export const DIALOG_OVERLAY_CLASSES = 'bg-black/60 backdrop-blur-[2px] duration-200 ease-out';

export const DIALOG_CONTENT_MOTION_CLASSES =
  'duration-200 ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98';
