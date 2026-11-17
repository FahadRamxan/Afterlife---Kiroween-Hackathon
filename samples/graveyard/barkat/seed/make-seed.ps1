# Generates PARTY.csv and LEDGER.csv for Barkat Kiryana Ledger. Run from the repo root:
#   powershell -File samples/graveyard/barkat/seed/make-seed.ps1
# Deterministic (fixed LCG seed). Replays every entry in integer paisa and stops if a balance
# would go over the credit limit, below zero, or past what N(8,2) can hold.
$ErrorActionPreference = 'Stop'
$enc = New-Object Text.UTF8Encoding $false
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parties = @(
  @('P001', 'HAJI BASHIR WHOLESALE', 'RAJA BAZAAR', 15000000),
  @('P002', 'CHAUDHRY RIAZ SB', 'SADDAR', 3000000),
  @('P003', 'BAJI SHAMIM', 'DHOKE RATTA', 2000000),
  @('P004', 'MASTER JI ASLAM', 'SATELLITE TOWN', 1500000),
  @('P005', 'KHAN SAHIB (PATHAN)', 'PIRWADHAI', 1000000),
  @('P006', 'PHUPHO NASREEN', 'DHOKE RATTA', 800000),
  @('P007', 'DOCTOR SAHIB CLINIC', 'MURREE ROAD', 2500000),
  @('P008', 'MISTRI RAFIQ', 'TENCH BHATA', 500000),
  @('P009', 'HAFIZ JI MADRASSA', 'PIRWADHAI', 1200000),
  @('P010', 'BHAI JAN ZAHID', 'SADDAR', 1000000),
  @('P011', 'CHACHA KHAIR DIN', 'RAJA BAZAAR', 600000),
  @('P012', 'MAULVI SB MASJID', 'COMMITTEE CHOWK', 800000),
  @('P013', 'NAAN WALA TANDOOR', 'MURREE ROAD', 2000000),
  @('P014', 'CHAI KHANA AKRAM', 'COMMITTEE CHOWK', 1500000),
  @('P015', 'SABZI WALA NAWAZ', 'TENCH BHATA', 700000),
  @('P016', 'DHOBI RASHEED', 'WESTRIDGE', 500000),
  @('P017', 'JAVED HAIR CUTTING', 'SATELLITE TOWN', 600000),
  @('P018', 'TAILOR MASTER IQBAL', 'SADDAR', 900000),
  @('P019', 'BEGUM SAHIBA KOTHI 7', 'WESTRIDGE', 3000000),
  @('P020', 'SHEIKH SB', 'RAJA BAZAAR', 2000000),
  @('P021', 'MALIK SB TRANSPORT', 'PIRWADHAI', 2500000),
  @('P022', 'RANA JI', 'DHOKE RATTA', 1000000),
  @('P023', 'BUTT SAHIB DAIRY', 'MURREE ROAD', 1800000),
  @('P024', 'AUNTY ROBINA', 'SATELLITE TOWN', 800000),
  @('P025', 'SARDAR JI TAXI STAND', 'SADDAR', 700000)
)
$notes = 'ATTA 20 KG', 'GHEE 2.5 KG', 'CHEENI 5 KG', 'DAAL MASH', 'CHAWAL BASMATI', 'CHAI PATTI', 'SABUN',
  'DOODH PATTI', 'MASALA', 'TEL SARSON', 'ANDAY 2 DARJAN', 'BISCUIT', 'MAIDA', 'BESAN'
$script:seed = 7
function rnd($n) { $script:seed = ($script:seed * 1103515245 + 12345) % 2147483648; return [int]($script:seed % $n) }

# Hand-written histories for the parties the scenarios use.
$fixed = @{
  # Big wholesale buyer: Rs 98,500 owed, limit Rs 1,50,000. The next Rs 2,000 sale overflows N(8,2).
  P001 = @(@('19961001', 'S', 7500000, 'PURANA HISAB'), @('19961015', 'S', 2350000, 'ATTA 50 BORI'),
    @('19961020', 'P', 1000000, 'NAQAD'), @('19961105', 'S', 500000, 'CHEENI 2 BORI'),
    @('19961112', 'P', 500000, 'NAQAD'), @('19961116', 'S', 1000000, 'GHEE 1 PETI'))
  # Ordinary customer, last paid in October: on the November reminder list.
  P003 = @(@('19961001', 'S', 320000, 'PURANA HISAB'), @('19961008', 'S', 85000, 'GHEE 2.5 KG'),
    @('19961022', 'P', 200000, 'NAQAD'), @('19961103', 'S', 129000, 'ATTA 20 KG'),
    @('19961114', 'S', 200000, 'CHAWAL BASMATI'))
  # Close to the limit: Rs 9,800 of Rs 10,000.
  P005 = @(@('19961001', 'S', 650000, 'PURANA HISAB'), @('19961012', 'S', 200000, 'ATTA 20 KG'),
    @('19961025', 'P', 50000, 'NAQAD'), @('19961109', 'S', 180000, 'GHEE 2.5 KG'))
  # Paid everything in November: balance 0, not on the reminder list.
  P010 = @(@('19961001', 'S', 150000, 'PURANA HISAB'), @('19961110', 'P', 150000, 'POORA HISAB'))
}

$entries = @()
$final = @{}
foreach ($p in $parties) {
  $id = $p[0]; $limit = $p[3]; $bal = 0; $lastPay = ''
  if ($fixed.ContainsKey($id)) { $list = $fixed[$id] }
  else {
    $list = @(, @('19961001', 'S', (10000 * (5 + (rnd 40))), 'PURANA HISAB'))
    $d = 1
    for ($i = 0; $i -lt (2 + (rnd 4)); $i++) {
      $d += 3 + (rnd 9)
      if ($d -gt 50) { break }
      $date = if ($d -le 31) { '199610{0:D2}' -f $d } else { '199611{0:D2}' -f ($d - 31) }
      if ((rnd 3) -eq 0) { $list += , @($date, 'P', (5000 * (2 + (rnd 20))), 'NAQAD') }
      else { $list += , @($date, 'S', (500 * (20 + (rnd 300))), $notes[(rnd $notes.Count)]) }
    }
  }
  foreach ($e in $list) {
    $amt = $e[2]
    if ($e[1] -eq 'S') {
      if ($bal + $amt -gt $limit) { if ($fixed.ContainsKey($id)) { throw "$id goes over its limit" }; continue }
      $bal += $amt
    } else {
      $amt = [Math]::Min($amt, $bal)
      if ($amt -le 0) { continue }
      $bal -= $amt
      $lastPay = $e[0]
    }
    if ($bal -gt 9999999) { throw "$id balance overflows N(8,2) in the seed" }
    $entries += [pscustomobject]@{ D = $e[0]; P = $id; K = $e[1]; A = $amt; B = $bal; N = $e[3] }
  }
  $final[$id] = @{ BAL = $bal; LAST = $lastPay }
}
function money($v) { '{0}.{1:D2}' -f [Math]::Floor($v / 100), ($v % 100) }
$entries = $entries | Sort-Object D, P
$led = @('# Barkat Kiryana Store, Raja Bazaar, Rawalpindi. Udhaar (credit) ledger, Oct-Nov 1996.',
  '# KIND S = sale on credit, P = payment. BALANCE is the party balance after the entry.',
  'ENTRY:N:5:0,TX_DATE:D:8,PARTY_ID:C:4,KIND:C:1,AMOUNT:N:8:2,BALANCE:N:8:2,NOTE:C:20')
$n = 0
foreach ($e in $entries) { $n++; $led += "$n,$($e.D),$($e.P),$($e.K),$(money $e.A),$(money $e.B),$($e.N)" }
$par = @('# 25 parties. Names are romanised Urdu, as typed on the 1996 PC. LIMIT is the credit limit.',
  'PARTY_ID:C:4,NAME:C:25,AREA:C:15,LIMIT:N:9:2,BALANCE:N:8:2,LAST_PAY:D:8')
foreach ($p in $parties) { $f = $final[$p[0]]; $par += "$($p[0]),$($p[1]),$($p[2]),$(money $p[3]),$(money $f.BAL),$($f.LAST)" }
[IO.File]::WriteAllText((Join-Path $dir 'PARTY.csv'), (($par -join "`n") + "`n"), $enc)
[IO.File]::WriteAllText((Join-Path $dir 'LEDGER.csv'), (($led -join "`n") + "`n"), $enc)
"wrote $($parties.Count) parties and $n ledger entries"
