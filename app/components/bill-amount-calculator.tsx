
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calculator, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BillAmountCalculatorProps {
  onInsertTotal: (total: number) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}

export function BillAmountCalculator({ onInsertTotal, label = "Bill Amount Calculator", disabled = false }: BillAmountCalculatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [amounts, setAmounts] = useState<{ id: string; value: string; label: string }[]>([
    { id: '1', value: '', label: '' }
  ]);

  const addRow = () => {
    setAmounts([...amounts, { id: Date.now().toString(), value: '', label: '' }]);
  };

  const removeRow = (id: string) => {
    if (amounts.length > 1) {
      setAmounts(amounts.filter(item => item.id !== id));
    }
  };

  const updateValue = (id: string, value: string) => {
    setAmounts(amounts.map(item => 
      item.id === id ? { ...item, value } : item
    ));
  };

  const updateLabel = (id: string, label: string) => {
    setAmounts(amounts.map(item => 
      item.id === id ? { ...item, label } : item
    ));
  };

  const calculateTotal = () => {
    return amounts.reduce((sum, item) => {
      const value = parseFloat(item.value);
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
  };

  const handleInsertTotal = () => {
    const total = calculateTotal();
    onInsertTotal(total);
    setIsOpen(false);
  };

  const clearAll = () => {
    setAmounts([{ id: '1', value: '', label: '' }]);
  };

  const total = calculateTotal();

  // Check if label is a simple icon (React element without text)
  const isIconOnly = typeof label !== 'string';

  return (
    <div className="relative inline-block">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "h-8 w-8 transition-colors",
          isOpen && "bg-purple-50 border-purple-300"
        )}
        title="Quick Calculator"
        disabled={disabled}
      >
        <Calculator className="h-4 w-4" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-[90]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Calculator Modal */}
          <Card className="fixed inset-0 m-auto w-[90vw] max-w-md h-fit shadow-xl border-2 border-purple-200 bg-white z-[100]">
            <CardHeader className="pb-3 pt-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Quick Calculator
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            {/* Amount rows */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {amounts.map((item, index) => (
                <div key={item.id} className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                  <Input
                    type="text"
                    placeholder="Label (optional)"
                    value={item.label}
                    onChange={(e) => updateLabel(item.id, e.target.value)}
                    className="text-sm h-9 flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={item.value}
                    onChange={(e) => updateValue(item.id, e.target.value)}
                    className="text-sm h-9 w-32"
                    step="0.01"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(item.id)}
                    disabled={amounts.length === 1}
                    className="h-9 w-9 p-0"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Add row button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              className="w-full gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Row
            </Button>

            {/* Total display */}
            <div className="pt-3 border-t">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold">Total:</span>
                <span className="text-xl font-bold text-purple-600">
                  ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  className="flex-1"
                >
                  Clear All
                </Button>
                <Button
                  type="button"
                  onClick={handleInsertTotal}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  disabled={total === 0}
                >
                  Insert Total
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </>
      )}
    </div>
  );
}
