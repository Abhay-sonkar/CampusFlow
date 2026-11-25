# Creates the four test users in the Docker database and gives them their roles.
# Run it once from the CampusFlow folder, after: docker compose up --build -d
#     powershell -ExecutionPolicy Bypass -File .\scripts\docker-seed.ps1
# Afterwards the manual-tests scripts (phase4.ps1 ... phase7b.ps1) work against the Docker stack.
$base = "http://localhost:5000"
$users = @(
  @{ name = "Abhay"; email = "abhay@test.com"; branch = "CSE"; year = 3; role = "COLLEGE_ADMIN" },
  @{ name = "Cse Student"; email = "cse@test.com"; branch = "CSE"; year = 3; role = "STUDENT" },
  @{ name = "Ece Student"; email = "ece@test.com"; branch = "ECE"; year = 2; role = "STUDENT" },
  @{ name = "Staff Member"; email = "staff@test.com"; role = "FACULTY" }
)

foreach ($u in $users) {
  $body = @{ name = $u.name; email = $u.email; password = "Test@1234" }
  if ($u.branch) { $body.branch = $u.branch }
  if ($u.year) { $body.year = $u.year }
  try {
    Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -ContentType "application/json" -Body ($body | ConvertTo-Json) | Out-Null
    Write-Host "created  $($u.email)" -ForegroundColor Green
  } catch {
    Write-Host "skipped  $($u.email) (it probably exists already)" -ForegroundColor Yellow
  }
  if ($u.role -ne "STUDENT") {
    # Roles can only be set from inside the stack: nobody can promote themselves through the API
    docker compose exec -T api node dist/scripts/setRole.js $u.email $u.role
  }
}
Write-Host "`nDone. Password for every user: Test@1234"
