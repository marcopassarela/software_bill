'use client';

import { useState, useEffect } from 'react';
import { createCheckoutSession, getCheckoutSessionStatus } from '@/app/actions/checkout';
import { loadStripe } from '@stripe/stripe-js';

interface CheckoutFormProps {
  planId: string;
  planName: string;
  planPrice: string;
  companyName: string;
  email: string;
  onSuccess: (sessionId: string) => void;
  onCancel: () => void;
}

export function CheckoutForm({
  planId,
  planName,
  planPrice,
  companyName,
  email,
  onSuccess,
  onCancel,
}: CheckoutFormProps) {
  const [clientSecret, setClientSecret] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);

  // Criar sessão de checkout
  useEffect(() => {
    async function initCheckout() {
      setLoading(true);
      setError('');
      try {
        const result = await createCheckoutSession(planId, companyName, email);
        setClientSecret(result.clientSecret);
        setSessionId(result.sessionId);
      } catch (err: any) {
        setError(err?.message || 'Erro ao iniciar o checkout');
      } finally {
        setLoading(false);
      }
    }

    if (!clientSecret && planId) {
      initCheckout();
    }
  }, [planId, companyName, email, clientSecret]);

  // Carregar o Stripe EmbeddedCheckout quando houver clientSecret
  useEffect(() => {
    if (!clientSecret || checkoutReady) return;

    const loadCheckout = async () => {
      try {
        const stripe = await loadStripe(
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
        );
        if (!stripe) throw new Error('Stripe falhou ao carregar');

        const container = document.getElementById('checkout-container');
        if (!container) throw new Error('Área de checkout não encontrada');
        container.innerHTML = '';

        // Stripe v22 usa createEmbeddedCheckoutPage.
        const checkout = await stripe.createEmbeddedCheckoutPage({ clientSecret });
        checkout.mount('#checkout-container');
        setCheckoutReady(true);
      } catch (err: any) {
        console.error('[v0] Erro ao carregar Stripe:', err);
        setError('Erro ao carregar o formulário de pagamento');
      }
    };

    loadCheckout();
  }, [clientSecret, checkoutReady]);

  // Polling para verificar o status do pagamento
  useEffect(() => {
    if (!sessionId || paymentStatus) return;

    const interval = setInterval(async () => {
      try {
        const status = await getCheckoutSessionStatus(sessionId);
        setPaymentStatus(status.paymentStatus);

        if (status.paymentStatus === 'paid') {
          clearInterval(interval);
          onSuccess(sessionId);
        }
      } catch (err) {
        // Ignorar erros de polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, paymentStatus, onSuccess]);

  if (loading) {
    return (
      <div className="rounded-lg bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-600">Carregando formulário de pagamento…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-300"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">{planName}</p>
            <p className="text-xs text-slate-500">{companyName}</p>
          </div>
          <p className="text-lg font-bold text-brand">{planPrice}</p>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          Cartão de crédito ou Pix · Pagamento único
        </p>
      </div>

      {paymentStatus === 'paid' && (
        <div className="rounded-lg bg-green-50 p-4">
          <p className="text-sm text-green-700">✓ Pagamento recebido com sucesso!</p>
          <p className="mt-1 text-xs text-green-600">Finalizando seu cadastro…</p>
        </div>
      )}

      <div
        id="checkout-container"
        className={`rounded-lg border border-slate-200 ${!checkoutReady ? 'bg-slate-50' : ''}`}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={paymentStatus === 'paid'}
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60 hover:bg-slate-200"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
