# Runs the resource-booking checks, including a concurrency test, against http://localhost:5000
# Needs these users (password Test@1234): abhay@test.com (COLLEGE_ADMIN), cse@test.com, ece@test.com (STUDENT), staff@test.com (FACULTY)
$base = "http://localhost:5000"
$script:pass = 0
$script:fail = 0

function Login($email) {
  (Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{ email = $email; password = "Test@1234" } | ConvertTo-Json)).accessToken
}
function Report($name, $ok, $detail) {
  if ($ok) { Write-Host "PASS  $name  $detail" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "FAIL  $name  $detail" -ForegroundColor Red; $script:fail++ }
}
function Check($name, $expected, $method, $path, $body = $null, $token = $null, $assert = $null) {
  $p = @{ Method = $method; Uri = "$base$path"; UseBasicParsing = $true; Headers = @{} }
  if ($token) { $p.Headers.Authorization = "Bearer $token" }
  if ($body) { $p.Body = $body; $p.ContentType = "application/json" }
  $json = $null
  try { $r = Invoke-WebRequest @p; $code = [int]$r.StatusCode; $json = $r.Content | ConvertFrom-Json }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  $script:last = $json
  $ok = ($code -eq $expected)
  $detail = "[$code]"
  if (-not $ok) { $detail = "[got $code, expected $expected]" }
  elseif ($assert -and $json) {
    if (-not (& $assert $json)) { $ok = $false; $detail = "[$code] but the response was not what we expected" }
  }
  Report $name $ok $detail
}

# Sends all requests at the same instant (not one after another) and returns the status codes
function FireAll($bodies, $tokens) {
  Add-Type -AssemblyName System.Net.Http
  [System.Net.ServicePointManager]::DefaultConnectionLimit = 50
  $client = New-Object System.Net.Http.HttpClient
  $tasks = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $bodies.Count; $i++) {
    $req = New-Object System.Net.Http.HttpRequestMessage -ArgumentList ([System.Net.Http.HttpMethod]::Post), "$base/api/bookings"
    $req.Headers.Add("Authorization", "Bearer $($tokens[$i])")
    $req.Content = New-Object System.Net.Http.StringContent -ArgumentList $bodies[$i], ([Text.Encoding]::UTF8), "application/json"
    [void]$tasks.Add($client.SendAsync($req))
  }
  [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]$tasks.ToArray())
  $codes = @()
  foreach ($t in $tasks) { $codes += [int]$t.Result.StatusCode }
  $client.Dispose()
  return $codes
}

# Times are built in UTC. Tm 3 10 30 = 3 days from today at 10:30 UTC
$today = (Get-Date).ToUniversalTime().Date
function Tm($daysAhead, $hour, $minute = 0) { $today.AddDays($daysAhead).AddHours($hour).AddMinutes($minute).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") }
function Bk($resourceId, $start, $end, $purpose = "Practical session") { @{ resource = $resourceId; start = $start; end = $end; purpose = $purpose } | ConvertTo-Json -Compress }
function Js($obj) { $obj | ConvertTo-Json -Compress }

try { $admin = Login "abhay@test.com"; $cse = Login "cse@test.com"; $ece = Login "ece@test.com"; $staff = Login "staff@test.com" }
catch { Write-Host "Could not log in. Is the server running, and do all 4 test users exist?" -ForegroundColor Red; exit 1 }

$stamp = Get-Date -Format "HHmmss"

Write-Host "`n--- Resources ---"
Check "admin creates a lab" 201 POST "/api/resources" (Js @{ name = "Lab A $stamp"; type = "LAB"; location = "Block 2"; capacity = 40 }) $admin
$rid = $script:last.resource._id
Check "student cannot create a resource" 403 POST "/api/resources" (Js @{ name = "Hack Lab"; type = "LAB" }) $cse
Check "duplicate name rejected" 409 POST "/api/resources" (Js @{ name = "lab a $stamp"; type = "LAB" }) $admin
Check "invalid type rejected" 400 POST "/api/resources" (Js @{ name = "Odd thing $stamp"; type = "SPACESHIP" }) $admin
Check "anyone can open a resource" 200 GET "/api/resources/$rid" $null $cse
Check "search by name and type" 200 GET "/api/resources?type=LAB&q=Lab A $stamp" $null $ece { param($j) $j.pagination.total -eq 1 }

Write-Host "`n--- Booking rules ---"
Check "start in the past" 400 POST "/api/bookings" (Bk $rid (Tm -1 10) (Tm -1 11)) $cse
Check "not on a 30-minute mark" 400 POST "/api/bookings" (Bk $rid (Tm 3 10 15) (Tm 3 11)) $cse
Check "end before start" 400 POST "/api/bookings" (Bk $rid (Tm 3 11) (Tm 3 10)) $cse
Check "longer than 8 hours" 400 POST "/api/bookings" (Bk $rid (Tm 3 8) (Tm 3 17)) $cse
Check "no timezone in the time" 400 POST "/api/bookings" (Bk $rid ((Tm 3 10).TrimEnd('Z')) (Tm 3 11)) $cse
Check "too far ahead" 400 POST "/api/bookings" (Bk $rid (Tm 120 10) (Tm 120 11)) $cse
Check "unknown resource" 404 POST "/api/bookings" (Bk "000000000000000000000000" (Tm 3 10) (Tm 3 11)) $cse
Check "no token" 401 POST "/api/bookings" (Bk $rid (Tm 3 10) (Tm 3 11))

Write-Host "`n--- Overlap prevention ---"
Check "cse books 10:00-11:00" 201 POST "/api/bookings" (Bk $rid (Tm 3 10) (Tm 3 11)) $cse { param($j) $j.booking.status -eq "PENDING" }
$b1 = $script:last.booking._id
Check "10:30-11:30 overlaps -> rejected" 409 POST "/api/bookings" (Bk $rid (Tm 3 10 30) (Tm 3 11 30)) $ece
Check "identical time -> rejected" 409 POST "/api/bookings" (Bk $rid (Tm 3 10) (Tm 3 11)) $ece
Check "back-to-back 11:00-12:00 is fine" 201 POST "/api/bookings" (Bk $rid (Tm 3 11) (Tm 3 12)) $ece
$b2 = $script:last.booking._id
Check "09:00-12:00 swallows both -> rejected" 409 POST "/api/bookings" (Bk $rid (Tm 3 9) (Tm 3 12)) $staff
Check "availability shows 2 taken, no private details" 200 GET "/api/resources/$rid/availability?from=$(Tm 3 0)&to=$(Tm 4 0)" $null $staff { param($j) $j.isFree -eq $false -and $j.bookings.Count -eq 2 -and -not $j.bookings[0].purpose }
Check "a free window reports free" 200 GET "/api/resources/$rid/availability?from=$(Tm 3 13)&to=$(Tm 3 14)" $null $staff { param($j) $j.isFree -eq $true }

Write-Host "`n--- Approve, reject, cancel ---"
Check "student cannot approve" 403 POST "/api/bookings/$b1/approve" $null $cse
Check "admin approves" 200 POST "/api/bookings/$b1/approve" $null $admin { param($j) $j.booking.status -eq "APPROVED" }
Check "cannot approve twice" 409 POST "/api/bookings/$b1/approve" $null $admin
Check "reject needs a reason" 400 POST "/api/bookings/$b2/reject" "{}" $admin
Check "admin rejects with a reason" 200 POST "/api/bookings/$b2/reject" (Js @{ note = "Lab is needed for an exam" }) $admin { param($j) $j.booking.status -eq "REJECTED" }
Check "rejected slot is free again" 201 POST "/api/bookings" (Bk $rid (Tm 3 11) (Tm 3 12)) $cse
Check "other student cannot cancel it" 404 POST "/api/bookings/$b1/cancel" $null $ece
Check "owner cancels approved booking" 200 POST "/api/bookings/$b1/cancel" $null $cse { param($j) $j.booking.status -eq "CANCELLED" }
Check "cancelled slot is free again" 201 POST "/api/bookings" (Bk $rid (Tm 3 10) (Tm 3 11)) $ece
Check "cannot cancel twice" 409 POST "/api/bookings/$b1/cancel" $null $cse

Write-Host "`n--- History and visibility ---"
Check "cse history has 2 bookings" 200 GET "/api/bookings/mine?resource=$rid" $null $cse { param($j) $j.pagination.total -eq 2 }
Check "ece history has 2 bookings" 200 GET "/api/bookings/mine?resource=$rid" $null $ece { param($j) $j.pagination.total -eq 2 }
Check "student cannot list everyone's bookings" 403 GET "/api/bookings" $null $cse
Check "admin sees the pending queue" 200 GET "/api/bookings?status=PENDING&resource=$rid" $null $admin { param($j) $j.pagination.total -eq 2 }

Write-Host "`n--- Concurrency: many requests at the same instant ---"
Check "admin creates a second resource" 201 POST "/api/resources" (Js @{ name = "Seminar Hall $stamp"; type = "SEMINAR_HALL"; capacity = 200 }) $admin
$rid2 = $script:last.resource._id
$tokens = @($cse, $ece, $staff, $admin, $cse, $ece, $staff, $admin, $cse, $ece)
$same = Bk $rid2 (Tm 4 10) (Tm 4 11)
$codes = FireAll @($same, $same, $same, $same, $same, $same, $same, $same, $same, $same) $tokens
$won = @($codes | Where-Object { $_ -eq 201 }).Count
$lost = @($codes | Where-Object { $_ -eq 409 }).Count
Report "10 identical requests: exactly 1 wins" ($won -eq 1 -and $lost -eq 9) "[201 x$won, 409 x$lost]"

$early = Bk $rid2 (Tm 5 10) (Tm 5 11)
$late = Bk $rid2 (Tm 5 10 30) (Tm 5 11 30)
$codes = FireAll @($early, $late, $early, $late, $early, $late, $early, $late) $tokens
$won = @($codes | Where-Object { $_ -eq 201 }).Count
$lost = @($codes | Where-Object { $_ -eq 409 }).Count
Report "8 partly-overlapping requests: exactly 1 wins" ($won -eq 1 -and $lost -eq 7) "[201 x$won, 409 x$lost]"

Check "database holds exactly 2 bookings for both races" 200 GET "/api/resources/$rid2/availability?from=$(Tm 4 0)&to=$(Tm 6 0)" $null $admin { param($j) $j.bookings.Count -eq 2 }

Write-Host "`n--- Deactivated resource ---"
Check "admin deactivates the resource" 200 PATCH "/api/resources/$rid2" (Js @{ isActive = $false }) $admin
Check "cannot book a deactivated resource" 409 POST "/api/bookings" (Bk $rid2 (Tm 7 10) (Tm 7 11)) $cse
Check "students no longer see it in the list" 200 GET "/api/resources?q=Seminar Hall $stamp" $null $cse { param($j) $j.pagination.total -eq 0 }

Write-Host "`n$($script:pass) passed, $($script:fail) failed" -ForegroundColor Cyan
