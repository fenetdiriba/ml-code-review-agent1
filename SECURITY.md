# Security Guidelines

## API Key Management 

### ⚠️ IMPORTANT: Never commit API keys to version control!

This project uses NVIDIA API keys for AI functionality. Follow these security practices:

### 1. Environment Variables
- API keys are stored in `secrets.env` file
- This file is **NOT** tracked by git (see `.gitignore`)
- Never commit the actual `secrets.env` file

### 2. Setup Instructions
1. Copy `secrets.env.template` to `secrets.env`
2. Replace `your_nvidia_api_key_here` with your actual NVIDIA API key
3. Keep `secrets.env` local and never share it

### 3. File Structure
```
secrets.env.template  # Template file (safe to commit)
secrets.env          # Actual keys (NOT tracked by git)
```

### 4. Security Checklist
- [ ] `secrets.env` is in `.gitignore`
- [ ] No API keys in source code
- [ ] No API keys in commit history
- [ ] Template file contains placeholder values only

### 5. If API Key is Compromised
1. Immediately rotate your NVIDIA API key
2. Update `secrets.env` with the new key
3. Check git history for any accidental commits
4. Consider the key compromised if it was ever committed

### 6. Development Best Practices
- Use environment variables for all sensitive data
- Never log API keys or sensitive information
- Use placeholder values in templates
- Regularly audit for exposed credentials

## Protected Files
The following files are protected and should never contain real credentials:
- `secrets.env.template` (template only)
- `README.md` (documentation only)
- Source code files (use environment variables)

## Reporting Security Issues
If you find a security vulnerability, please report it immediately. 
