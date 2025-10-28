#!/bin/bash
# Setup isolated Python environment for SpeechBrain speaker separation
# This ensures clean, reproducible installations without polluting system Python

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$PROJECT_ROOT/.venv_speechbrain"

echo "=== SpeechBrain Environment Setup ==="
echo "Project root: $PROJECT_ROOT"
echo "Virtual environment: $VENV_DIR"
echo ""

# Use Python 3.10 (compatible with PyTorch and SpeechBrain)
PYTHON_BIN="/Library/Frameworks/Python.framework/Versions/3.10/bin/python3"

if [ ! -f "$PYTHON_BIN" ]; then
    echo "ERROR: Python 3.10 not found at $PYTHON_BIN"
    echo "Please install Python 3.10 from python.org"
    exit 1
fi

echo "Using Python: $PYTHON_BIN"
$PYTHON_BIN --version
echo ""

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    $PYTHON_BIN -m venv "$VENV_DIR"
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip setuptools wheel

# Install dependencies
echo ""
echo "Installing PyTorch and TorchAudio..."
pip install torch==2.2.2 torchaudio==2.2.2

echo ""
echo "Installing SpeechBrain..."
pip install speechbrain==1.0.3

echo ""
echo "Installing additional dependencies..."
pip install huggingface_hub

# Verify installation
echo ""
echo "=== Verifying Installation ==="
python -c "import torch; print(f'PyTorch: {torch.__version__}')"
python -c "import torchaudio; print(f'TorchAudio: {torchaudio.__version__}')"
python -c "import speechbrain; print(f'SpeechBrain: {speechbrain.__version__}')"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Virtual environment location: $VENV_DIR"
echo "Python executable: $VENV_DIR/bin/python"
echo ""
echo "To activate this environment manually:"
echo "  source $VENV_DIR/bin/activate"
echo ""
echo "To use with Node.js scripts, they will automatically use:"
echo "  $VENV_DIR/bin/python"

