"use client";

import { DadsButton } from "@/components/dads/DadsButton";
import { DadsStatusBanner } from "@/components/dads/DadsStatus";
import { useModalDialog } from "@/components/dads/client";
import {
  ModalDialog,
  ModalDialogActions,
  ModalDialogBody,
  ModalDialogClose,
  ModalDialogContent,
  ModalDialogHeader,
  ModalDialogHeading,
} from "@/vendor/dads-runtime/components/ModalDialog/ModalDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function AbandonSessionDialog({ open, onClose, onConfirm }: Props) {
  const modal = useModalDialog({
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
  });

  return (
    <ModalDialog
      {...modal.dialogProps}
      className="practice-dads-surface z-50"
      width="min(34rem, calc(100vw - 2rem))"
    >
      <ModalDialogContent>
        <ModalDialogHeader>
          <ModalDialogHeading {...modal.headingProps}>一問一答を中断しますか</ModalDialogHeading>
          <ModalDialogClose {...modal.closeButtonProps} />
        </ModalDialogHeader>
        <ModalDialogBody>
          <DadsStatusBanner title="この受験の途中経過を破棄します" type="warning">
            設定画面に戻ります。完了していないため、学習進捗には加算されません。
          </DadsStatusBanner>
        </ModalDialogBody>
        <ModalDialogActions className="flex flex-wrap justify-end gap-3">
          <DadsButton type="button" size="md" variant="outline" onClick={modal.closeButtonProps.onClick}>
            続ける
          </DadsButton>
          <DadsButton type="button" size="md" variant="solid-fill" onClick={onConfirm}>
            中断して戻る
          </DadsButton>
        </ModalDialogActions>
      </ModalDialogContent>
    </ModalDialog>
  );
}
