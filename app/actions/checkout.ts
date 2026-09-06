'use server';

import { stripe } from '@/lib/stripe';
import { getPlanById, PLAN_PRODUCTS } from '@/lib/plans';

export interface CheckoutSession {
  clientSecret: string;
  sessionId: string;
}

/**
 * Cria uma sessão de checkout no Stripe.
 * Valida o produto server-side e cria o Checkout.
 * Retorna o client_secret para embedar na página.
 */
export async function createCheckoutSession(
  planId: string,
  companyName: string,
  email: string
): Promise<CheckoutSession> {
  const plan = getPlanById(planId);
  if (!plan) {
    throw new Error(`Plano não encontrado: ${planId}`);
  }

  if (!email || !companyName) {
    throw new Error('Email e nome da empresa são obrigatórios');
  }

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?checkout_session_id={CHECKOUT_SESSION_ID}`,
      redirect_on_completion: 'never',
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: plan.name,
              description: plan.description,
            },
            unit_amount: plan.priceInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_method_types: ['card', 'pix'],
      customer_email: email,
      metadata: {
        company_name: companyName,
        plan_key: plan.key,
      },
    });

    return {
      clientSecret: session.client_secret || '',
      sessionId: session.id,
    };
  } catch (error) {
    console.error('[Checkout] Erro ao criar sessão:', error);
    throw new Error('Não foi possível criar a sessão de checkout');
  }
}

/**
 * Obtém o status de uma sessão de checkout.
 * Retorna os detalhes da sessão incluindo payment_status.
 */
export async function getCheckoutSessionStatus(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      sessionId: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
      customerEmail: session.customer_email,
      metadata: session.metadata,
      amountTotal: session.amount_total,
      currency: session.currency,
    };
  } catch (error) {
    console.error('[Checkout] Erro ao recuperar sessão:', error);
    throw new Error('Não foi possível recuperar o status da sessão');
  }
}
