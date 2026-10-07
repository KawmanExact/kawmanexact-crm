# Product Tracking Worksheet — Excel Template & Guidelines

## 1. Worksheet Structure

### Sheet Names & Purpose
| Sheet | Purpose | Protection |
|-------|---------|------------|
| **Products** | Master product catalog | Locked (header row + validation columns) |
| **Tracking** | Daily/weekly tracking entries | Unlocked (data entry area) |
| **Lookups** | Reference lists (units, categories, statuses) | Hidden + Locked |
| **Dashboard** | Pivot summaries, charts | Locked |

---

## 2. Master Columns — `Products` Sheet

| Col | Header | Type | Validation / Rules | Notes |
|-----|--------|------|-------------------|-------|
| A | **Product ID** | Text (PK) | `=AND(LEN(A2)>0, COUNTIF(A:A, A2)=1)` — unique, non-empty | Auto-generate: `PRD-` + 5-digit seq |
| B | **Product Name** | Text | `=LEN(B2)>0` — required | |
| C | **Variant / Grade** | Text | Optional | e.g. "Food Grade", "1% WD" |
| D | **Category** | List | Source: `Lookups!$A$2:$A$20` | Nutraceutical, Pharma, Cosmetics, etc. |
| E | **Unit (Base UoM)** | List | **Required** — Source: `Lookups!$B$2:$B$15` | kg, g, L, mL, pcs, box, drum, bag |
| F | **Alt Unit** | List | Source: `Lookups!$B$2:$B$15` | For conversion (e.g. kg ↔ g) |
| G | **Conversion Factor** | Number | `=IF(F2="", "", AND(G2>0, ISNUMBER(G2)))` | Alt Unit = Base × Factor |
| H | **Default Unit Price (₹)** | Currency | `=IF(H2="", TRUE, AND(ISNUMBER(H2), H2>=0))` | Per **Base Unit** |
| I | **Unit Cost (₹)** | Currency | `=IF(I2="", TRUE, AND(ISNUMBER(I2), I2>=0))` | Per **Base Unit** |
| J | **HSN / SAC Code** | Text | `=OR(J2="", AND(LEN(J2)>=4, LEN(J2)<=8, ISNUMBER(VALUE(J2))))` | GST HSN |
| K | **GST Rate (%)** | Number | Source: `Lookups!$C$2:$C$10` | 0, 5, 12, 18, 28 |
| L | **Is Active** | Boolean | `=OR(L2=TRUE, L2=FALSE)` | Data → Validation → List: TRUE,FALSE |
| M | **Created At** | DateTime | Auto: `=IF(A2<>"", NOW(), "")` (via macro) | Locked |
| N | **Updated At** | DateTime | Auto on edit (macro) | Locked |

---

## 3. Tracking Columns — `Tracking` Sheet

| Col | Header | Type | Validation / Rules | Notes |
|-----|--------|------|-------------------|-------|
| A | **Entry ID** | Text (PK) | Auto: `TRK-` + YYMMDD + 4-digit seq | Locked |
| B | **Date** | Date | `=AND(ISNUMBER(B2), B2<=TODAY(), B2>=DATE(YEAR(TODAY()),1,1))` | Required |
| C | **Product ID** | List | Source: `Products!$A$2:$A$5000` | Required — VLOOKUP pulls name/unit |
| D | **Product Name** | Text | `=IFERROR(VLOOKUP(C2, Products!A:B, 2, FALSE), "")` | Locked, auto |
| E | **Unit (Base)** | Text | `=IFERROR(VLOOKUP(C2, Products!A:E, 5, FALSE), "")` | Locked, auto |
| F | **Qty (Base Unit)** | Number | **Required** — `=AND(ISNUMBER(F2), F2>0)` | Enter in base UoM |
| G | **Alt Qty** | Number | `=IF(E2="", "", F2*VLOOKUP(C2, Products!A:G, 7, FALSE))` | Locked, auto |
| H | **Unit Price (₹)** | Currency | `=IF(H2="", VLOOKUP(C2, Products!A:H, 8, FALSE), AND(ISNUMBER(H2), H2>=0))` | Defaults to master |
| I | **Unit Cost (₹)** | Currency | `=IF(I2="", VLOOKUP(C2, Products!A:I, 9, FALSE), AND(ISNUMBER(I2), I2>=0))` | Defaults to master |
| J | **Line Value (₹)** | Currency | `=F2*H2` | Locked, calculated |
| K | **Line Cost (₹)** | Currency | `=F2*I2` | Locked, calculated |
| L | **Margin (₹)** | Currency | `=J2-K2` | Locked |
| M | **Margin %** | % | `=IF(J2=0, 0, L2/J2)` | Locked, format % |
| N | **Customer / Ref** | Text | Optional | PO #, customer name |
| O | **Status** | List | Source: `Lookups!$D$2:$D$6` | Draft, Confirmed, Invoiced, Paid, Cancelled |
| P | **Notes** | Text | Optional | Free text |
| Q | **Entered By** | Text | Auto: `=ENVIRON("USERNAME")` (macro) | Locked |
| R | **Entered At** | DateTime | Auto: `=NOW()` (macro) | Locked |

---

## 4. Lookups Sheet — `Lookups` (Hidden)

| Range | List | Values |
|-------|------|--------|
| `A2:A20` | **Categories** | Nutraceutical, Pharmaceutical, Cosmetics, Functional Food, Food & Beverage, Other |
| `B2:B15` | **Units (UoM)** | kg, g, mg, L, mL, µL, pcs, box, bag, drum, tote, pack, roll, m, m² |
| `C2:C10` | **GST Rates** | 0, 5, 12, 18, 28 |
| `D2:D6` | **Tracking Status** | Draft, Confirmed, Invoiced, Paid, Cancelled |

> Define each as **Named Range**: `luCategory`, `luUnit`, `luGST`, `luStatus` — use in Data Validation → Source: `=luUnit` etc.

---

## 5. Data Validation Rules — Summary

| Rule | Applies To | Formula / Setting |
|------|------------|-------------------|
| **Unit required** | `Products!E:E`, `Tracking!F:F` | `Custom: =LEN(E2)>0` + Input Message: "Select base unit from list" |
| **Positive qty** | `Tracking!F:F` | `Custom: =AND(ISNUMBER(F2), F2>0)` |
| **Price ≥ 0** | `Products!H:I`, `Tracking!H:I` | `Custom: =OR(H2="", AND(ISNUMBER(H2), H2>=0))` |
| **Unique Product ID** | `Products!A:A` | `Custom: =COUNTIF(A:A, A2)=1` |
| **Valid HSN** | `Products!J:J` | `Custom: =OR(J2="", AND(LEN(J2)>=4, LEN(J2)<=8, ISNUMBER(VALUE(J2))))` |
| **Date not future** | `Tracking!B:B` | `Custom: =AND(ISNUMBER(B2), B2<=TODAY())` |
| **Status list** | `Tracking!O:O` | `List: =luStatus` |
| **Category list** | `Products!D:D` | `List: =luCategory` |
| **GST list** | `Products!K:K` | `List: =luGST` |

---

## 6. Conditional Formatting

| Range | Rule | Format |
|-------|------|--------|
| `Tracking!F:F` | `=F2=""` | Fill: Light Red — **missing qty** |
| `Tracking!H:H` | `=H2=0` | Fill: Light Yellow — **zero price** |
| `Tracking!M:M` | `=M2<0` | Font: Red — **negative margin** |
| `Tracking!M:M` | `=M2>0.25` | Fill: Light Green — **good margin >25%** |
| `Products!L:L` | `=L2=FALSE` | Font: Gray, Strikethrough — **inactive** |
| `Tracking!O:O` | `=O2="Draft"` | Fill: Light Blue |
| `Tracking!O:O` | `=O2="Paid"` | Fill: Light Green |

---

## 7. Layout & Readability

### Freeze Panes (Critical for Scroll)
| Sheet | Freeze |
|-------|--------|
| **Products** | **Row 1** (headers) + **Column A** (Product ID) |
| **Tracking** | **Row 1** (headers) + **Columns A:E** (ID → Unit) |
| **Dashboard** | Row 1–3 (title + slicers) |

> **How:** View → Freeze Panes → Freeze Top Row + Freeze First Column (Products: A; Tracking: A:E)

### Column Widths (Auto-fit + Min)
| Sheet | Col | Width |
|-------|-----|-------|
| Products | A | 14 (ID) |
| Products | B | 30 (Name) |
| Products | C–E | 18 |
| Products | F–G | 14 |
| Products | H–I | 16 |
| Products | J–K | 14 |
| Products | L–N | 16 |
| Tracking | A | 16 |
| Tracking | B | 12 |
| Tracking | C | 14 |
| Tracking | D | 30 |
| Tracking | E | 12 |
| Tracking | F–I | 14 |
| Tracking | J–M | 16 |
| Tracking | N | 20 |
| Tracking | O | 14 |
| Tracking | P | 30 |
| Tracking | Q–R | 18 |

### Row Height
- Header row: **28 pt** (bold, centered, wrap text)
- Data rows: **20 pt** (vertical center)

### Table Style
- Format as **Table** (`Ctrl+T`) on each sheet: `tblProducts`, `tblTracking`
- Style: **Medium 9** (dark header, banded rows)
- **Total Row** enabled on Tracking: Sum Qty, Sum Value, Sum Cost, Avg Margin%

### Print Setup
- Orientation: **Landscape**
- Margins: **Narrow**
- Fit: **1 page wide**, **Auto pages tall**
- Repeat rows: `$1:$1` (header)
- Repeat columns: Products `$A:$A`, Tracking `$A:$E`

---

## 8. Named Ranges for Formulas

| Name | Refers To | Use |
|------|-----------|-----|
| `tblProducts` | `Products!$A$1:$N$5000` | VLOOKUP source |
| `tblTracking` | `Tracking!$A$1:$R$50000` | Pivot source |
| `luCategory` | `Lookups!$A$2:$A$20` | DV list |
| `luUnit` | `Lookups!$B$2:$B$15` | DV list |
| `luGST` | `Lookups!$C$2:$C$10` | DV list |
| `luStatus` | `Lookups!$D$2:$D$6` | DV list |

---

## 9. Data Entry Macros (Optional but Recommended)

```vba
' In ThisWorkbook module
Private Sub Workbook_SheetChange(ByVal Sh As Object, ByVal Target As Range)
    If Sh.Name = "Products" Then
        If Not Intersect(Target, Sh.Range("A:A")) Is Nothing Then
            If Target.Value <> "" And Target.Offset(0, 12).Value = "" Then
                Target.Offset(0, 12).Value = Now  ' Created At
                Target.Offset(0, 13).Value = Now  ' Updated At
            Else
                Target.Offset(0, 13).Value = Now  ' Updated At
            End If
        End If
    ElseIf Sh.Name = "Tracking" Then
        If Not Intersect(Target, Sh.Range("A:A")) Is Nothing Then
            If Target.Value <> "" Then
                Target.Offset(0, 16).Value = Environ("USERNAME")  ' Entered By
                Target.Offset(0, 17).Value = Now                   ' Entered At
            End If
        End If
    End If
End Sub
```

---

## 10. Protection & Sharing

1. **Unlock** data entry cells:
   - Products: `B2:N5000` (except A, M, N)
   - Tracking: `B2:P50000` (except A, D, E, G, J, K, L, M, Q, R)
2. **Review → Protect Sheet** → Password (optional)
   - Allow: Select locked/unlocked cells, Format cells, Insert rows, AutoFilter, Sort
3. **File → Info → Protect Workbook → Protect Workbook Structure** (prevent sheet delete/move)

---

## 11. Quick Start Checklist

- [ ] Create 4 sheets with exact names
- [ ] Populate `Lookups` with lists above
- [ ] Define Named Ranges (`luCategory`, `luUnit`, `luGST`, `luStatus`)
- [ ] Build `Products` table with validations + conditional formatting
- [ ] Build `Tracking` table with VLOOKUPs + calculated columns
- [ ] Set **Freeze Panes** per Section 7
- [ ] Apply column widths + row heights
- [ ] Format as Tables (`tblProducts`, `tblTracking`)
- [ ] Add Total Row on Tracking
- [ ] Protect sheets (unlock entry cells first)
- [ ] Test: enter a row in Tracking → verify auto-fill, validation, totals
- [ ] Save as **`.xltx`** (Template) for reuse

---

## 12. Analysis-Ready Pivot (Dashboard Sheet)

| Pivot | Rows | Values | Filters / Slicers |
|-------|------|--------|-------------------|
| **Qty by Product** | Product Name | Sum of Qty (Base) | Date (Timeline), Status |
| **Value by Category** | Category | Sum of Line Value | Date, Product |
| **Margin Analysis** | Product Name | Avg of Margin %, Sum of Margin ₹ | Date, Status |
| **Monthly Trend** | Date (Months) | Sum of Line Value, Sum of Line Cost | Category, Product |
| **Unit Utilization** | Unit (Base) | Count of Entries, Sum of Qty | Date |

> Insert → PivotTable → Source: `tblTracking` → Place on `Dashboard` sheet

---

**Version:** 1.0  
**Maintained by:** CRM / Sales Ops  
**Last Updated:** 2026-10-07