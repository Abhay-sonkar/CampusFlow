# Runs the Opportunity Hub checks against http://localhost:5000
# Needs these users (password Test@1234): abhay@test.com (COLLEGE_ADMIN), cse@test.com (STUDENT, CSE, year 3),
# ece@test.com (STUDENT, ECE, year 2), staff@test.com (FACULTY)
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
function Js($obj) { $obj | ConvertTo-Json -Compress -Depth 6 }

# Deadlines are built in UTC: Tm 5 12 = 5 days from today at 12:00 UTC
$today = (Get-Date).ToUniversalTime().Date
function Tm($daysAhead, $hour, $minute = 0) { $today.AddDays($daysAhead).AddHours($hour).AddMinutes($minute).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") }

try { $admin = Login "abhay@test.com"; $cse = Login "cse@test.com"; $ece = Login "ece@test.com"; $staff = Login "staff@test.com" }
catch { Write-Host "Could not log in. Is the server running, and do all 4 test users exist?" -ForegroundColor Red; exit 1 }

# A unique word in every title, so each run only looks at its own data
$stamp = "zz" + (Get-Date -Format "HHmmss")

Write-Host "`n--- Profiles ---"
Check "student sets skills (cleaned up)" 200 PATCH "/api/users/me" (Js @{ skills = @("React", "Node", "MongoDB", "react") }) $cse { param($j) $j.user.skills.Count -eq 3 -and $j.user.skills[0] -ceq "react" }
Check "second student sets skills" 200 PATCH "/api/users/me" (Js @{ skills = @("Embedded", "C") }) $ece
Check "invalid year rejected" 400 PATCH "/api/users/me" (Js @{ year = 9 }) $cse
Check "empty update rejected" 400 PATCH "/api/users/me" "{}" $cse
Check "profile needs a login" 401 PATCH "/api/users/me" (Js @{ year = 3 })

Write-Host "`n--- Posting opportunities ---"
Check "student cannot post" 403 POST "/api/opportunities" (Js @{ title = "Hack $stamp"; description = "Not allowed for students."; category = "EVENT"; organization = "Nobody"; deadline = (Tm 5 12) }) $cse
Check "deadline in the past" 400 POST "/api/opportunities" (Js @{ title = "Old $stamp"; description = "The deadline is already over."; category = "EVENT"; organization = "Acme"; deadline = (Tm -2 12) }) $staff
Check "unknown category" 400 POST "/api/opportunities" (Js @{ title = "Odd $stamp"; description = "Not a real category here."; category = "PARTY"; organization = "Acme"; deadline = (Tm 5 12) }) $staff
Check "bad apply link rejected" 400 POST "/api/opportunities" (Js @{ title = "Link $stamp"; description = "The apply link is not http."; category = "EVENT"; organization = "Acme"; deadline = (Tm 5 12); applyUrl = "ftp://example.com/x" }) $staff
Check "staff posts a React internship (CSE, years 3-4)" 201 POST "/api/opportunities" (Js @{ title = "React Internship $stamp"; description = "Build web apps with React and Node."; category = "INTERNSHIP"; organization = "Acme"; deadline = (Tm 5 12); applyUrl = "https://example.com/apply"; skills = @("React", "Node"); eligibility = @{ branches = @("cse"); years = @(3, 4) } }) $staff { param($j) $j.opportunity.eligibility.branches[0] -ceq "CSE" }
$o1 = $script:last.opportunity._id
Check "admin posts an embedded hackathon (ECE, EEE)" 201 POST "/api/opportunities" (Js @{ title = "Embedded Hackathon $stamp"; description = "Build an embedded system in 24 hours."; category = "HACKATHON"; organization = "TechFest"; deadline = (Tm 20 12); skills = @("embedded", "c"); eligibility = @{ branches = @("ECE", "EEE") } }) $admin
$o2 = $script:last.opportunity._id
Check "admin posts an open scholarship" 201 POST "/api/opportunities" (Js @{ title = "Open Scholarship $stamp"; description = "A merit scholarship for every student."; category = "SCHOLARSHIP"; organization = "Foundation"; deadline = (Tm 30 12) }) $admin
$o3 = $script:last.opportunity._id
Check "admin posts a first-year workshop" 201 POST "/api/opportunities" (Js @{ title = "First Year Workshop $stamp"; description = "An introduction for first year students."; category = "WORKSHOP"; organization = "Club"; deadline = (Tm 10 12); eligibility = @{ years = @(1) } }) $admin
$o4 = $script:last.opportunity._id
Check "admin posts a Node contest" 201 POST "/api/opportunities" (Js @{ title = "Node Contest $stamp"; description = "A coding contest for Node developers."; category = "CONTEST"; organization = "CodeClub"; deadline = (Tm 3 12); skills = @("node") }) $admin
$o5 = $script:last.opportunity._id
Check "staff posts an open internship" 201 POST "/api/opportunities" (Js @{ title = "Open Internship $stamp"; description = "An internship open to every branch."; category = "INTERNSHIP"; organization = "Globex"; deadline = (Tm 25 12) }) $staff
$o6 = $script:last.opportunity._id

Write-Host "`n--- Browsing and filters ---"
Check "all 6 are listed, soonest deadline first" 200 GET "/api/opportunities?q=$stamp" $null $cse { param($j) $j.pagination.total -eq 6 -and $j.items[0].title -like "Node Contest*" }
Check "filter by category" 200 GET "/api/opportunities?q=$stamp&category=INTERNSHIP" $null $cse { param($j) $j.pagination.total -eq 2 }
Check "filter by one skill" 200 GET "/api/opportunities?q=$stamp&skills=node" $null $cse { param($j) $j.pagination.total -eq 2 }
Check "filter: closing within 7 days" 200 GET "/api/opportunities?q=$stamp&closingWithin=7" $null $cse { param($j) $j.pagination.total -eq 2 }
Check "only what I am eligible for (CSE, year 3)" 200 GET "/api/opportunities?q=$stamp&eligibleForMe=true" $null $cse { param($j) $j.pagination.total -eq 4 }
Check "only what I am eligible for (ECE, year 2)" 200 GET "/api/opportunities?q=$stamp&eligibleForMe=true" $null $ece { param($j) $j.pagination.total -eq 4 }
Check "filter: open to ECE" 200 GET "/api/opportunities?q=$stamp&branch=ECE" $null $cse { param($j) $j.pagination.total -eq 5 }
Check "sort by newest" 200 GET "/api/opportunities?q=$stamp&sort=newest" $null $cse { param($j) $j.items[0].title -like "Open Internship*" }
Check "pagination" 200 GET "/api/opportunities?q=$stamp&limit=4&page=2" $null $cse { param($j) $j.items.Count -eq 2 -and $j.pagination.pages -eq 2 }
Check "bad filter value rejected" 400 GET "/api/opportunities?category=PARTY" $null $cse
Check "browsing needs a login" 401 GET "/api/opportunities"

Write-Host "`n--- One opportunity ---"
Check "eligible student sees it as eligible" 200 GET "/api/opportunities/$o1" $null $cse { param($j) $j.opportunity.viewer.eligible -eq $true -and $j.opportunity.viewer.bookmarked -eq $false }
Check "other branch sees it as not eligible" 200 GET "/api/opportunities/$o1" $null $ece { param($j) $j.opportunity.viewer.eligible -eq $false }
Check "unknown id" 404 GET "/api/opportunities/000000000000000000000000" $null $cse
Check "malformed id" 404 GET "/api/opportunities/not-an-id" $null $cse

Write-Host "`n--- Recommendations (before any activity) ---"
Check "CSE student: React internship first with the exact score 75" 200 GET "/api/opportunities/recommended?limit=20" $null $cse { param($j) $m = @($j.items | Where-Object { $_.title -like "*$stamp*" }); $m.Count -eq 2 -and $m[0].title -like "React*" -and $m[0].score -eq 75 -and $m[1].title -like "Node Contest*" -and $m[1].score -eq 30 }
Check "reasons explain the score" 200 GET "/api/opportunities/recommended?limit=20" $null $cse { param($j) $m = @($j.items | Where-Object { $_.title -like "React*$stamp" }); ($m[0].reasons -join " ") -like "*skills*" -and ($m[0].reasons -join " ") -like "*CSE*" }
Check "ineligible ones are never recommended" 200 GET "/api/opportunities/recommended?limit=20" $null $cse { param($j) @($j.items | Where-Object { $_.title -like "Embedded*$stamp" -or $_.title -like "First Year*$stamp" }).Count -eq 0 }
Check "ECE student: only the embedded hackathon, score 55" 200 GET "/api/opportunities/recommended?limit=20" $null $ece { param($j) $m = @($j.items | Where-Object { $_.title -like "*$stamp*" }); $m.Count -eq 1 -and $m[0].title -like "Embedded*" -and $m[0].score -eq 55 }
Check "unrelated open items are not recommended" 200 GET "/api/opportunities/recommended?limit=20" $null $cse { param($j) @($j.items | Where-Object { $_.title -like "Open*$stamp" }).Count -eq 0 }

Write-Host "`n--- Bookmarks ---"
Check "student bookmarks the internship" 200 POST "/api/opportunities/$o1/bookmark" $null $cse { param($j) $j.bookmarked -eq $true }
Check "bookmarking twice changes nothing" 200 POST "/api/opportunities/$o1/bookmark" $null $cse
Check "counter went up exactly once" 200 GET "/api/opportunities/$o1" $null $cse { param($j) $j.opportunity.bookmarkCount -eq 1 -and $j.opportunity.viewer.bookmarked -eq $true }
Check "bookmark list shows it" 200 GET "/api/opportunities/bookmarks" $null $cse { param($j) $j.pagination.total -eq 1 -and $j.items[0].opportunity.title -like "React*" }
Check "other student's list is empty" 200 GET "/api/opportunities/bookmarks" $null $ece { param($j) $j.pagination.total -eq 0 }
Check "bookmark an unknown id" 404 POST "/api/opportunities/000000000000000000000000/bookmark" $null $cse
Check "remove the bookmark" 200 DELETE "/api/opportunities/$o1/bookmark" $null $cse { param($j) $j.bookmarked -eq $false }
Check "removing again is harmless" 200 DELETE "/api/opportunities/$o1/bookmark" $null $cse
Check "counter is back to zero" 200 GET "/api/opportunities/$o1" $null $cse { param($j) $j.opportunity.bookmarkCount -eq 0 }

Write-Host "`n--- Application tracker ---"
Check "eligible student applies" 201 POST "/api/opportunities/$o1/apply" (Js @{ notes = "Sent my CV" }) $cse { param($j) $j.application.status -eq "APPLIED" }
$app1 = $script:last.application._id
Check "applying twice is refused" 409 POST "/api/opportunities/$o1/apply" $null $cse
Check "wrong branch cannot apply" 403 POST "/api/opportunities/$o1/apply" $null $ece
Check "wrong branch cannot apply (hackathon)" 403 POST "/api/opportunities/$o2/apply" $null $cse
Check "apply without a body is fine" 201 POST "/api/opportunities/$o5/apply" $null $cse
$app5 = $script:last.application._id
Check "opportunity shows my application" 200 GET "/api/opportunities/$o1" $null $cse { param($j) $j.opportunity.viewer.applicationStatus -eq "APPLIED" -and $j.opportunity.applicationCount -eq 1 }
Check "update my status" 200 PATCH "/api/applications/$app1" (Js @{ status = "SHORTLISTED"; notes = "Interview on Friday" }) $cse { param($j) $j.application.status -eq "SHORTLISTED" }
Check "invalid status rejected" 400 PATCH "/api/applications/$app1" (Js @{ status = "WON" }) $cse
Check "someone else cannot touch it" 404 PATCH "/api/applications/$app1" (Js @{ status = "REJECTED" }) $ece
Check "my tracker lists both" 200 GET "/api/applications" $null $cse { param($j) $j.pagination.total -eq 2 }
Check "filter the tracker by status" 200 GET "/api/applications?status=SHORTLISTED" $null $cse { param($j) $j.pagination.total -eq 1 -and $j.items[0].opportunity.title -like "React*" }
Check "other student's tracker is empty" 200 GET "/api/applications" $null $ece { param($j) $j.pagination.total -eq 0 }
Check "remove tracking for the contest" 200 DELETE "/api/applications/$app5" $null $cse
Check "contest counter went back down" 200 GET "/api/opportunities/$o5" $null $cse { param($j) $j.opportunity.applicationCount -eq 0 }

Write-Host "`n--- Recommendations (after applying) ---"
Check "applied ones disappear; interest in internships adds points" 200 GET "/api/opportunities/recommended?limit=20" $null $cse { param($j) $m = @($j.items | Where-Object { $_.title -like "*$stamp*" }); $m.Count -eq 2 -and @($m | Where-Object { $_.title -like "React*" }).Count -eq 0 -and $m[0].title -like "Node Contest*" -and $m[1].title -like "Open Internship*" -and $m[1].score -eq 10 -and ($m[1].reasons -join " ") -like "*interest*" }

Write-Host "`n--- Managing opportunities ---"
Check "owner edits the posting" 200 PATCH "/api/opportunities/$o1" (Js @{ title = "React Internship (updated) $stamp"; eligibility = @{ years = @(2, 3, 4) } }) $staff { param($j) $j.opportunity.eligibility.years.Count -eq 3 -and $j.opportunity.eligibility.branches[0] -eq "CSE" }
Check "cannot move the deadline into the past" 400 PATCH "/api/opportunities/$o1" (Js @{ deadline = (Tm -1 12) }) $staff
Check "student cannot edit" 403 PATCH "/api/opportunities/$o1" (Js @{ title = "Hacked" }) $cse
Check "staff cannot edit someone else's posting" 403 PATCH "/api/opportunities/$o2" (Js @{ title = "Hacked" }) $staff
Check "admin can edit any posting" 200 PATCH "/api/opportunities/$o6" (Js @{ location = "Remote" }) $admin
Check "staff hides their open internship" 200 PATCH "/api/opportunities/$o6" (Js @{ isActive = $false }) $staff
Check "hidden posting leaves the listing" 200 GET "/api/opportunities?q=$stamp" $null $cse { param($j) $j.pagination.total -eq 5 }
Check "students cannot open a hidden posting" 404 GET "/api/opportunities/$o6" $null $cse
Check "its owner still can" 200 GET "/api/opportunities/$o6" $null $staff
Check "owner sees their own postings, hidden ones included" 200 GET "/api/opportunities?q=$stamp&mine=true" $null $staff { param($j) $j.pagination.total -eq 2 }
Check "staff cannot delete someone else's posting" 403 DELETE "/api/opportunities/$o2" $null $staff
Check "student cannot delete" 403 DELETE "/api/opportunities/$o1" $null $cse
Check "owner deletes the internship" 200 DELETE "/api/opportunities/$o1" $null $staff
Check "its applications were removed with it" 200 GET "/api/applications" $null $cse { param($j) $j.pagination.total -eq 0 }
Check "deleted posting is gone" 404 GET "/api/opportunities/$o1" $null $cse

Write-Host "`n--- Clean up test data ---"
Check "delete scholarship" 200 DELETE "/api/opportunities/$o3" $null $admin
Check "delete workshop" 200 DELETE "/api/opportunities/$o4" $null $admin
Check "delete contest" 200 DELETE "/api/opportunities/$o5" $null $admin
Check "delete hackathon" 200 DELETE "/api/opportunities/$o2" $null $admin
Check "delete hidden internship" 200 DELETE "/api/opportunities/$o6" $null $admin

Write-Host "`n$($script:pass) passed, $($script:fail) failed" -ForegroundColor Cyan
