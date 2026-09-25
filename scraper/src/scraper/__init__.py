import questionary
from rich.console import Console
from rich.panel import Panel

from scraper.stages import STAGES

EXIT = "exit"

console = Console()


def main() -> None:
    console.print(Panel.fit("[bold]FindFungi scraper[/bold]", border_style="green"))
    choices = [
        questionary.Choice(f"{stage.number}. {stage.title}", value=stage)
        for stage in STAGES
    ] + [questionary.Separator(), questionary.Choice("Exit", value=EXIT)]

    while True:
        stage = questionary.select("Select a stage to run:", choices=choices).ask()
        if stage is None or stage == EXIT:  # None means Ctrl+C
            console.print("Bye!")
            break
        console.rule(f"Stage {stage.number}: {stage.title}")
        stage.run()
        console.print()
