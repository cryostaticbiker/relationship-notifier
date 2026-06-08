import subprocess

COMMAND_FILE = "commands.txt"

def run_command(cmd: str):
    print(f"\n> {cmd}")
    result = subprocess.run(cmd, shell=True, text=True, capture_output=True)

    if result.stdout:
        print(result.stdout)

    if result.stderr:
        print("ERROR:")
        print(result.stderr)

    return result.returncode

def main():
    try:
        with open(COMMAND_FILE, "r") as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"Could not find {COMMAND_FILE}")
        return

    for line in lines:
        cmd = line.strip()

        # skip empty lines and comments
        if not cmd or cmd.startswith("#"):
            continue

        code = run_command(cmd)

        # stop on error (optional behavior)
        if code != 0:
            print(f"Command failed with exit code {code}. Stopping.")
            break

if __name__ == "__main__":
    main()