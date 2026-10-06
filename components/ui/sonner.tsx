"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useCampaignTheme } from "@/hooks/use-campaign-theme"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const icon = (node: React.ReactNode, tone: string) => (
  <span className={`zm-toast-symbol ${tone}`}>{node}</span>
)

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useCampaignTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: icon(<CircleCheckIcon className="size-[18px]" />, "success"),
        info: icon(<InfoIcon className="size-[18px]" />, "info"),
        warning: icon(<TriangleAlertIcon className="size-[18px]" />, "warning"),
        error: icon(<OctagonXIcon className="size-[18px]" />, "error"),
        loading: icon(<Loader2Icon className="size-[18px] animate-spin" />, "loading"),
      }}
      toastOptions={{
        classNames: {
          toast: "zm-toast",
          title: "zm-toast-title",
          description: "zm-toast-description",
          icon: "zm-toast-icon",
          closeButton: "zm-toast-close",
          actionButton: "zm-toast-action",
          cancelButton: "zm-toast-cancel",
        },
      }}
      style={
        {
          "--normal-bg": "#102629",
          "--normal-text": "#eef5ef",
          "--normal-border": "#42645d",
          "--border-radius": "10px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
