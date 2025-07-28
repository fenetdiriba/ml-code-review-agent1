# 🔒 Security Guide

## API Keys and Sensitive Information

### ✅ Protected Files
The following files are now protected by `.gitignore` and will NOT be committed to version control:

- `secrets.env` - Contains your actual NVIDIA API key
- `variables.env` - Environment variables
- `*.env` - Any environment files
- `nvapi-*` - Files containing NVIDIA API keys
- `temp_uploads/` - Temporary uploaded files
- `uploads/` - Uploaded files

### 🔑 Setting Up Your API Key

1. **Copy the template**:
   ```bash
   cp secrets.env.template secrets.env
   ```

2. **Edit the file** and add your actual API key:
   ```bash
   # secrets.env
   ```

3. **Never commit** `secrets.env` to version control

### 🛡️ Security Best Practices

#### ✅ DO:
- Use environment variables for all API keys
- Keep `secrets.env` in your local machine only
- Use the template file for documentation
- Regularly rotate your API keys

#### ❌ DON'T:
- Hardcode API keys in source code
- Commit `secrets.env` to version control
- Share API keys in public repositories
- Use the same API key across multiple projects

### 🔍 Verification

To verify your setup is secure:

1. **Check git status**:
   ```bash
   git status
   ```
   You should NOT see `secrets.env` in the output.

2. **Test the backend**:
   ```bash
   python3 ml-code-review-extension/integrated-backend.py
   ```
   Should show: "✅ Backend initialized with API key: nvapi-XGZd0vItXFyHzK..."

### 🚨 If You Accidentally Commit Secrets

If you accidentally commit sensitive information:

1. **Immediately rotate your API key** on the NVIDIA platform
2. **Remove from git history**:
   ```bash
   git filter-branch --force --index-filter \
   "git rm --cached --ignore-unmatch secrets.env" \
   --prune-empty --tag-name-filter cat -- --all
   ```
3. **Force push** to remove from remote:
   ```bash
   git push origin --force
   ```

### 📁 File Structure
```
Nvidia-agent/
├── .gitignore              # Protects sensitive files
├── secrets.env.template    # Template for API key setup
├── secrets.env            # YOUR ACTUAL API KEY (not in git)
├── agent.py               # Uses environment variables
└── ml-code-review-extension/
    └── integrated-backend.py  # Uses environment variables
```

---

**Your API keys are now secure!** 🔐 