"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  error: Error | null;
};

export class RuntimeErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Zona Morta runtime boundary:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return <section className="panel panel-pad runtime-error-panel" role="alert">
      <div className="runtime-error-icon"><AlertTriangle size={22} aria-hidden /></div>
      <div>
        <p className="dossier-title">Erro de interface</p>
        <h3 className="section-title mt-1">{this.props.title ?? "Esta seção encontrou um problema"}</h3>
        <p className="intro-line mt-2">
          O restante da campanha continua carregado. Tente abrir a seção novamente; se o erro persistir,
          a mensagem técnica abaixo ajuda a localizar a causa sem derrubar toda a página.
        </p>
        <code className="runtime-error-message">{this.state.error.message || "Erro desconhecido"}</code>
        <Button className="mt-4" size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
          <RotateCcw size={15} /> Tentar novamente
        </Button>
      </div>
    </section>;
  }
}
