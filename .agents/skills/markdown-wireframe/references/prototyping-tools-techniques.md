# Prototyping Tools & Techniques

## Stitch Agent Workflow & Execution Rules

```python
# The only prototyping tool is the Agent -> Stitch pipeline.

class StitchPrototypingFramework:
    CONSTRAINTS = {
        'fidelity': 'Low-Fidelity Outline Wireframe',
        'code_completeness': 'Strictly Full Files (TSX + SCSS/Tailwind)',
        'allowed_colors': 'Monochrome (Black, White, Gray outlines only)',
        'forbidden_styles': ['colors', 'gradients', 'images', 'icons', 'generic SaaS UI'],
        'layout_requirements': 'State-of-the-art, non-standard, mobile-optimized'
    }

    def execute_stitch_flow(self, user_brief):
        """Map user brief to Stitch execution"""
        return {
            'step_1': 'Deconstruct user_brief to find unique mobile constraints',
            'step_2': 'Output YAML structural outline for user approval',
            'step_3': 'Trigger Stitch to write full component files'
        }

    def enforce_quality_standards(self):
        """Ensure output meets strict UI/UX guidelines"""
        return {
            'typography': 'Fluid scaling',
            'borders': 'Clean outlines, no messy shadows',
            'images': 'Box outlines with crossed diagonals',
            'icons': 'Text labels or simple geometric placeholders',
            'files': 'Complete SCSS provided. NO SNIPPETS.'
        }
```
