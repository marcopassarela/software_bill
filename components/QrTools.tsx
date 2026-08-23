'use client';

import { useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'qr-scanner-region';

// ============================================================
// Modal de escaneamento via câmera
// ============================================================
export function QrScannerModal({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false); // evita processar o mesmo QR 2x
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    const start = async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 8,
            qrbox: { width: 250, height: 250 },
          },
          async (decodedText) => {
            if (cancelled || handledRef.current) return;
            handledRef.current = true;

            // Para a câmera ANTES de chamar onScan
            try {
              await scanner.stop();
            } catch {
              // ignore
            }

            if (!cancelled) {
              onScan(decodedText.trim());
            }
          },
          () => {
            // frame sem QR — ignora
          }
        );

        if (!cancelled) setStarting(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(
            'Não foi possível acessar a câmera. Use HTTPS ou localhost e permita o acesso. ' +
              (e?.message || String(e))
          );
          setStarting(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.isScanning
          ? s
              .stop()
              .catch(() => {})
              .finally(() => {
                try {
                  s.clear();
                } catch {
                  // ignore
                }
              })
          : (() => {
              try {
                s.clear();
              } catch {
                // ignore
              }
            })();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Escanear QR Code do produto</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:underline"
          >
            Fechar
          </button>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {starting && !error && (
          <p className="mb-2 text-sm text-slate-500">Iniciando câmera…</p>
        )}

        <div
          id={SCANNER_ELEMENT_ID}
          className="min-h-[250px] overflow-hidden rounded-lg bg-slate-100"
        />

        <p className="mt-2 text-xs text-slate-500">
          Aponte a câmera para o QR Code. Funciona em <strong>localhost</strong> ou site com{' '}
          <strong>HTTPS</strong>.
        </p>
      </div>
    </div>
  );
}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Escanear QR Code do produto</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:underline"
          >
            Fechar
          </button>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {starting && !error && (
          <p className="mb-2 text-sm text-slate-500">Iniciando câmera…</p>
        )}

        <div
          id={SCANNER_ELEMENT_ID}
          className="min-h-[250px] overflow-hidden rounded-lg bg-slate-100"
        />

        <p className="mt-2 text-xs text-slate-500">
          Aponte a câmera para o QR Code. Funciona em <strong>localhost</strong> ou site com{' '}
          <strong>HTTPS</strong>.
        </p>
      </div>
    </div>
  );
}
// ============================================================
// Geração de QR e impressão de etiquetas
// ============================================================
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(String(text), {
    margin: 1,
    width: 300,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Gera PDF com etiquetas QR (código + nome + unidade).
 * Chame com a lista de produtos do estoque.
 */
export async function printProductLabels(products: any[]) {
  const list = (products || []).filter((p) => p && (p.code || p.id));
  if (!list.length) {
    alert('Nenhum produto válido para gerar etiqueta (precisa ter código).');
    return;
  }

  try {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const marginX = 10;
    const marginY = 10;
    const labelW = 60;
    const labelH = 32;
    const gapX = 5;
    const gapY = 5;
    const perRow = Math.max(
      1,
      Math.floor((pageW - 2 * marginX + gapX) / (labelW + gapX))
    );

    let x = marginX;
    let y = marginY;
    let col = 0;

    for (const p of list) {
      const code = String(p.code ?? p.id ?? '').trim();
      if (!code) continue;

      const dataUrl = await generateQrDataUrl(code);

      if (y + labelH > pageH - marginY) {
        doc.addPage();
        x = marginX;
        y = marginY;
        col = 0;
      }

      // borda da etiqueta
      doc.setDrawColor(160);
      doc.setLineWidth(0.3);
      doc.rect(x, y, labelW, labelH);

      // QR
      const qrSize = 26;
      doc.addImage(dataUrl, 'PNG', x + 2, y + 3, qrSize, qrSize);

      // textos
      const textX = x + qrSize + 5;
      const maxTextW = labelW - qrSize - 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(String(p.name || 'Sem nome').slice(0, 40), textX, y + 9, {
        maxWidth: maxTextW,
      });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`Cód: ${code}`, textX, y + 16, { maxWidth: maxTextW });

      if (p.unit) {
        doc.text(`Un: ${p.unit}`, textX, y + 21, { maxWidth: maxTextW });
      }
      if (p.location) {
        doc.text(`Loc: ${String(p.location).slice(0, 18)}`, textX, y + 26, {
          maxWidth: maxTextW,
        });
      }

      col++;
      if (col >= perRow) {
        col = 0;
        x = marginX;
        y += labelH + gapY;
      } else {
        x += labelW + gapX;
      }
    }

    const today = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    doc.save(`Etiquetas_QR_Produtos_${today}.pdf`);
  } catch (e: any) {
    console.error('Erro ao gerar etiquetas QR:', e);
    alert('Erro ao gerar etiquetas: ' + (e?.message || String(e)));
  }
}

// ============================================================
// Formulário de Entrada/Saída com Manual ou Escanear QR
// ============================================================
export function StockMovementForm({
  page,
  lookups,
  onSubmit,
}: {
  page: 'entry' | 'output';
  lookups: any;
  onSubmit: (data: any) => Promise<void>;
}) {
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  const [showScanner, setShowScanner] = useState(false);
  const [productId, setProductId] = useState('');
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [values, setValues] = useState<any>({
    quantity: '',
    responsible: '',
    sector: '',
    invoice: '',
    unit_value: '',
    observation: '',
    vehicle_id: '',
    recipient: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(key: string, v: string) {
    setValues((s: any) => ({ ...s, [key]: v }));
  }

  function handleScan(text: string) {
  // Fecha o modal primeiro (evita re-render com scanner ainda vivo)
  setShowScanner(false);

  const code = (text || '').trim();
  if (!code) {
    setError('QR Code vazio ou inválido.');
    return;
  }

  const product = (lookups.products || []).find(
    (p: any) => String(p.code ?? '').trim() === code
  );

  if (!product) {
    setError(
      `Nenhum produto encontrado com o código "${code}". Cadastre o produto ou use o modo manual.`
    );
    setScannedProduct(null);
    setProductId('');
    return;
  }

  setError('');
  setScannedProduct(product);
  setProductId(String(product.id));
}

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      setError('Selecione ou escaneie um produto.');
      return;
    }
    if (!values.quantity || Number(values.quantity) <= 0) {
      setError('Informe uma quantidade válida.');
      return;
    }
    if (page === 'output' && !values.recipient?.trim()) {
      setError('Informe quem retirou o material.');
      return;
    }

    setSaving(true);
    setError('');

    const data: any = {
      product_id: Number(productId),
      quantity: Number(values.quantity),
      responsible: values.responsible || null,
      sector: values.sector || null,
      observation: values.observation || null,
      unit_value: values.unit_value ? Number(values.unit_value) : null,
    };

    if (page === 'entry') {
      data.invoice = values.invoice || null;
    } else {
      data.vehicle_id = values.vehicle_id ? Number(values.vehicle_id) : null;
      data.recipient = values.recipient || null;
    }

    try {
      await onSubmit(data);
      setValues({
        quantity: '',
        responsible: '',
        sector: '',
        invoice: '',
        unit_value: '',
        observation: '',
        vehicle_id: '',
        recipient: '',
      });
      setProductId('');
      setScannedProduct(null);
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('manual');
            setScannedProduct(null);
            setProductId('');
            setError('');
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            mode === 'manual' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('scan');
            setProductId('');
            setScannedProduct(null);
            setError('');
          }}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            mode === 'scan' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Escanear QR Code
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {mode === 'manual' ? (
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Produto *</span>
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-lg border p-2"
            >
              <option value="">Selecione</option>
              {(lookups.products || []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Produto (via QR Code) *</span>
            {scannedProduct ? (
              <div className="flex items-center justify-between rounded-lg border bg-green-50 p-3">
                <div>
                  <div className="font-medium text-slate-900">{scannedProduct.name}</div>
                  <div className="text-xs text-slate-500">
                    Código: {scannedProduct.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="text-xs text-brand hover:underline"
                >
                  Escanear outro
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="w-full rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:bg-slate-50"
              >
                Abrir câmera e escanear QR Code
              </button>
            )}
          </div>
        )}

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Quantidade *</span>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={values.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            className="w-full rounded-lg border p-2"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">
            {page === 'entry' ? 'Responsável' : 'Responsável (quem entregou)'}
          </span>
          <input
            value={values.responsible}
            onChange={(e) => set('responsible', e.target.value)}
            className="w-full rounded-lg border p-2"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Setor</span>
          <input
            value={values.sector}
            onChange={(e) => set('sector', e.target.value)}
            className="w-full rounded-lg border p-2"
          />
        </label>

        {page === 'entry' ? (
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Nota fiscal</span>
            <input
              value={values.invoice}
              onChange={(e) => set('invoice', e.target.value)}
              className="w-full rounded-lg border p-2"
            />
          </label>
        ) : (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Veículo (se aplicável)</span>
              <select
                value={values.vehicle_id}
                onChange={(e) => set('vehicle_id', e.target.value)}
                className="w-full rounded-lg border p-2"
              >
                <option value="">Selecione</option>
                {(lookups.vehicles || []).map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {v.brand} {v.model}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Retirado por *</span>
              <input
                required
                value={values.recipient}
                onChange={(e) => set('recipient', e.target.value)}
                className="w-full rounded-lg border p-2"
              />
            </label>
          </>
        )}

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Valor unitário</span>
          <input
            type="number"
            step="0.01"
            value={values.unit_value}
            onChange={(e) => set('unit_value', e.target.value)}
            className="w-full rounded-lg border p-2"
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-600">Observação</span>
          <textarea
            value={values.observation}
            onChange={(e) => set('observation', e.target.value)}
            className="h-20 w-full rounded-lg border p-2"
          />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar registro'}
          </button>
        </div>
      </form>

      {showScanner && (
        <QrScannerModal
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}