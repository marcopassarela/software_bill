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
  const [error, setError] = useState('');

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          scanner.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {
          // erro de leitura de um frame — ignora, tenta o próximo
        }
      )
      .catch((e) => setError('Não foi possível acessar a câmera: ' + e));

    return () => {
      scanner.stop().catch(() => {});
      scanner.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Escanear QR Code do produto</h3>
          <button onClick={onClose} className="text-sm text-slate-500 hover:underline">
            Fechar
          </button>
        </div>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div id={SCANNER_ELEMENT_ID} className="overflow-hidden rounded-lg" />
        <p className="mt-2 text-xs text-slate-500">
          Aponte a câmera para o QR Code impresso no produto. Precisa de HTTPS (ou localhost) para a câmera funcionar.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Geração de QR e impressão de etiquetas
// ============================================================

export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 300 });
}

export async function printProductLabels(products: any[]) {
  if (!products.length) return;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210,
    pageH = 297;
  const marginX = 10,
    marginY = 10;
  const labelW = 60,
    labelH = 30,
    gapX = 5,
    gapY = 5;
  const perRow = Math.max(1, Math.floor((pageW - 2 * marginX + gapX) / (labelW + gapX)));
  let x = marginX,
    y = marginY,
    col = 0;

  for (const p of products) {
    const dataUrl = await generateQrDataUrl(String(p.code));
    if (y + labelH > pageH - marginY) {
      doc.addPage();
      x = marginX;
      y = marginY;
      col = 0;
    }
    doc.setDrawColor(180);
    doc.rect(x, y, labelW, labelH);
    doc.addImage(dataUrl, 'PNG', x + 2, y + 2, labelH - 4, labelH - 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(p.name || ''), x + labelH, y + 10, { maxWidth: labelW - labelH - 4 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Código: ${p.code}`, x + labelH, y + 16, { maxWidth: labelW - labelH - 4 });
    if (p.unit) doc.text(`Un: ${p.unit}`, x + labelH, y + 22);

    col++;
    if (col >= perRow) {
      col = 0;
      x = marginX;
      y += labelH + gapY;
    } else {
      x += labelW + gapX;
    }
  }
  doc.save('Etiquetas_QR_Produtos.pdf');
}

// ============================================================
// Formulário de Entrada/Saída com opção Manual ou Escanear QR Code
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
    setShowScanner(false);
    const product = (lookups.products || []).find((p: any) => String(p.code) === text.trim());
    if (!product) {
      setError(`Nenhum produto encontrado com o código "${text}". Cadastre o produto ou use o modo manual.`);
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
      setError(e.message);
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
                  <div className="text-xs text-slate-500">Código: {scannedProduct.code}</div>
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
            disabled={saving}
            className="mt-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar registro'}
          </button>
        </div>
      </form>

      {showScanner && <QrScannerModal onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}