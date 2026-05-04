# Branch Protection (apply after public flip)

Branch protection on private repos requires GitHub Pro. Apply these rules
immediately after making `floomhq/floom` public.

```bash
gh api repos/floomhq/floom/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field "required_status_checks[contexts][]=virgin-journey" \
  --field "required_status_checks[contexts][]=migration-drift" \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

After running: verify at https://github.com/floomhq/floom/settings/branches
