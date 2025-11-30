import { Router, Request, Response } from 'express';
import pgPool from '../db';
import ExcelJS from 'exceljs';

const router = Router();

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.get('/template', requireAuth, async (req: Request, res: Response) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Transações');

    sheet.columns = [
      { header: 'Data (DD/MM/YYYY)', key: 'date', width: 15 },
      { header: 'Descrição', key: 'description', width: 25 },
      { header: 'Categoria', key: 'category', width: 15 },
      { header: 'Tipo (INCOME/RECEITA ou EXPENSE/DESPESA)', key: 'type', width: 25 },
      { header: 'Valor', key: 'amount', width: 12 }
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B0082' } };

    sheet.addRow({
      date: '01/12/2024',
      description: 'Exemplo: Compra no supermercado',
      category: 'Alimentação',
      type: 'DESPESA',
      amount: 150.00
    });
    sheet.addRow({
      date: '05/12/2024',
      description: 'Exemplo: Salário',
      category: 'Salário',
      type: 'RECEITA',
      amount: 5000.00
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template_transacoes.xlsx"');

    await workbook.xlsx.write(res);
  } catch (error: any) {
    console.error('Error generating template:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ error: 'No file data provided' });

    const buffer = Buffer.from(fileData, 'base64');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const sheet = workbook.getWorksheet('Transações');
    if (!sheet) return res.status(400).json({ error: 'Sheet "Transações" not found' });

    const transactions: any[] = [];
    const errors: string[] = [];

    const getCellValue = (cell: any) => {
      if (!cell) return null;
      const val = cell.value;
      if (val === null || val === undefined) return null;
      if (typeof val === 'object' && val.result) return val.result;
      if (typeof val === 'object' && val.text) return val.text;
      return String(val).trim();
    };

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const date = getCellValue(row.getCell(1));
      const description = getCellValue(row.getCell(2));
      const category = getCellValue(row.getCell(3));
      const typeRaw = getCellValue(row.getCell(4));
      const amount = getCellValue(row.getCell(5));

      if (!date || !description || !category || !typeRaw || !amount) {
        errors.push(`Linha ${rowNumber}: Campos faltando`);
        return;
      }

      try {
        const typeStr = String(typeRaw).trim().toUpperCase();
        let normalizedType = typeStr;
        if (typeStr === 'INCOME') normalizedType = 'RECEITA';
        else if (typeStr === 'EXPENSE') normalizedType = 'DESPESA';
        else if (typeStr !== 'RECEITA' && typeStr !== 'DESPESA') {
          errors.push(`Linha ${rowNumber}: Tipo deve ser INCOME/EXPENSE/RECEITA/DESPESA`);
          return;
        }

        let dateObj = new Date(date as string);
        if (isNaN(dateObj.getTime())) {
          const parts = String(date).split('/');
          if (parts.length === 3) dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        if (isNaN(dateObj.getTime())) {
          errors.push(`Linha ${rowNumber}: Data inválida`);
          return;
        }

        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          errors.push(`Linha ${rowNumber}: Valor deve ser positivo`);
          return;
        }

        transactions.push({
          date: dateObj.toISOString().split('T')[0],
          description: String(description).trim(),
          category: String(category).trim(),
          type: normalizedType,
          amount: amountNum
        });
      } catch (err: any) {
        errors.push(`Linha ${rowNumber}: ${err.message}`);
      }
    });

    res.json({ transactions, errors });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    const { fileData } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided' });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const sheet = workbook.getWorksheet('Transações');
    if (!sheet) {
      return res.status(400).json({ error: 'Sheet "Transações" not found' });
    }

    let imported = 0;
    const errors: string[] = [];

    const getCellValue = (cell: any) => {
      if (!cell) return null;
      const val = cell.value;
      if (val === null || val === undefined) return null;
      if (typeof val === 'object' && val.result) return val.result;
      if (typeof val === 'object' && val.text) return val.text;
      return String(val).trim();
    };

    interface RowData {
      rowNumber: number;
      date: string | null;
      description: string | null;
      category: string | null;
      typeRaw: string | null;
      amount: string | null;
    }

    const rowsToProcess: RowData[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rowsToProcess.push({
        rowNumber,
        date: getCellValue(row.getCell(1)),
        description: getCellValue(row.getCell(2)),
        category: getCellValue(row.getCell(3)),
        typeRaw: getCellValue(row.getCell(4)),
        amount: getCellValue(row.getCell(5))
      });
    });

    for (const rowData of rowsToProcess) {
      const { rowNumber, date, description, category, typeRaw, amount } = rowData;

      console.log(`[IMPORT DEBUG Row ${rowNumber}] date="${date}" desc="${description}" cat="${category}" type="${typeRaw}" amount="${amount}"`);

      if (!date || !description || !category || !typeRaw || !amount) {
        errors.push(`Linha ${rowNumber}: Campos obrigatórios faltando (type=${typeRaw})`);
        continue;
      }

      try {
        const typeStr = String(typeRaw).trim().toUpperCase();
        console.log(`[IMPORT] Row ${rowNumber}: typeRaw="${typeRaw}" -> typeStr="${typeStr}"`);
        let normalizedType = typeStr;
        if (typeStr === 'INCOME') {
          normalizedType = 'RECEITA';
        } else if (typeStr === 'EXPENSE') {
          normalizedType = 'DESPESA';
        } else if (typeStr !== 'RECEITA' && typeStr !== 'DESPESA') {
          errors.push(`Linha ${rowNumber}: Tipo deve ser INCOME, EXPENSE, RECEITA ou DESPESA (encontrado: ${typeRaw})`);
          continue;
        }

        let dateObj = new Date(date as string);
        if (isNaN(dateObj.getTime())) {
          const parts = String(date).split('/');
          if (parts.length === 3) {
            dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
        }

        if (isNaN(dateObj.getTime())) {
          errors.push(`Linha ${rowNumber}: Data inválida: ${date}`);
          continue;
        }

        const amountNum = Number(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          errors.push(`Linha ${rowNumber}: Valor deve ser um número positivo`);
          continue;
        }

        const now = new Date().toISOString();
        await pgPool.query(
          `INSERT INTO transactions (id, user_id, date, description, category, type, amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            dateObj.toISOString().split('T')[0],
            String(description).trim(),
            String(category).trim(),
            normalizedType,
            amountNum,
            now
          ]
        );
        imported++;
      } catch (err: any) {
        errors.push(`Linha ${rowNumber}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      imported,
      errors,
      message: `Importadas ${imported} transações com sucesso!`
    });
  } catch (error: any) {
    console.error('Error importing Excel:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/logo', async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query('SELECT \`value\` FROM app_settings WHERE \`key\` = ?', ['app_logo']);
    const logo = result.rows[0];
    if (logo && logo.value) {
      res.json({ logo: logo.value });
    } else {
      res.json({ logo: null });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/logo', async (req: Request, res: Response) => {
  if (req.session?.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super Admin only' });
  }

  const { logo } = req.body;
  if (!logo) {
    return res.status(400).json({ error: 'No logo provided' });
  }

  try {
    await pgPool.query(
      `INSERT INTO app_settings (\`key\`, \`value\`)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
      ['app_logo', logo]
    );

    res.json({ success: true, message: 'Logo salvo com sucesso!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
