"""Build the architecture sheet or the single submission PDF after deployment."""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from xml.sax.saxutils import escape

import reportlab
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

WIDTH, HEIGHT = A4
MARGIN = 43
CONTENT = WIDTH - 2 * MARGIN
INK = HexColor('#182720')
MUTED = HexColor('#4b6055')
ACCENT = HexColor('#22593e')
PALE = HexColor('#eef4ed')
LINE = HexColor('#cbd8cb')
FONTS = Path(reportlab.__file__).parent / 'fonts'
pdfmetrics.registerFont(TTFont('Vera', str(FONTS / 'Vera.ttf')))
pdfmetrics.registerFont(TTFont('Vera-Bold', str(FONTS / 'VeraBd.ttf')))
BODY = ParagraphStyle('body', fontName='Vera', fontSize=11, leading=16, textColor=INK)
SMALL = ParagraphStyle('small', parent=BODY, fontSize=9.5, leading=13, textColor=MUTED)


def text(pdf, value, x, y, *, size=10, color=INK, font='Vera'):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    pdf.drawString(x, y, value)


def paragraph(pdf, value, y, *, style=BODY, draw=True):
    block = Paragraph(escape(value).replace('\n', '<br/>'), style)
    _, height = block.wrap(CONTENT, HEIGHT)
    if draw:
        block.drawOn(pdf, MARGIN, y - height)
    return y - height


def page_header(pdf, title, student):
    pdf.setFillColor(ACCENT)
    pdf.rect(0, HEIGHT - 11, WIDTH, 11, fill=1, stroke=0)
    text(pdf, 'LUMA VAULT  /  CLOUD COMPUTING FINAL PROJECT', MARGIN, HEIGHT - 49,
         size=9, color=ACCENT, font='Vera-Bold')
    text(pdf, title, MARGIN, HEIGHT - 85, size=27, font='Vera-Bold')
    text(pdf, student, MARGIN, HEIGHT - 107, size=10, color=MUTED)


def page_footer(pdf):
    pdf.setStrokeColor(LINE)
    pdf.line(MARGIN, 47, WIDTH - MARGIN, 47)
    text(pdf, 'FAST-NU Lahore  /  BCS 9A  /  Fall 2026', MARGIN, 32, size=8, color=MUTED)
    pdf.setFillColor(MUTED)
    pdf.setFont('Vera', 8)
    pdf.drawRightString(WIDTH - MARGIN, 32, str(pdf.getPageNumber()))
    pdf.showPage()


def arrow(pdf, start, end, y, bidirectional=False):
    pdf.setStrokeColor(ACCENT)
    pdf.line(start, y, end, y)
    pdf.line(end - 4, y + 3, end, y)
    pdf.line(end - 4, y - 3, end, y)
    if bidirectional:
        pdf.line(start + 4, y + 3, start, y)
        pdf.line(start + 4, y - 3, start, y)


def flow(pdf, title, y, nodes, bidirectional=()):
    box_width = 113
    gap = (CONTENT - 4 * box_width) / 3
    text(pdf, title, MARGIN, y + 51, size=9, color=ACCENT, font='Vera-Bold')
    for index, (label, detail) in enumerate(nodes):
        x = MARGIN + index * (box_width + gap)
        pdf.setFillColor(PALE)
        pdf.setStrokeColor(LINE)
        pdf.roundRect(x, y, box_width, 42, 5, fill=1, stroke=1)
        label_size = min(9, (box_width - 16) / pdfmetrics.stringWidth(label, 'Vera-Bold', 1))
        detail_size = min(8, (box_width - 16) / pdfmetrics.stringWidth(detail, 'Vera', 1))
        text(pdf, label, x + 8, y + 25, size=label_size, font='Vera-Bold')
        text(pdf, detail, x + 8, y + 11, size=detail_size, color=MUTED)
        if index < len(nodes) - 1:
            arrow(pdf, x + box_width + 2, x + box_width + gap - 2, y + 21,
                  index in bidirectional)


def architecture(pdf, student):
    page_header(pdf, 'Architecture', student)
    paragraph(pdf, 'Amplify Hosting serves the React application. The browser uses separate '
              'credentials for the REST API, GraphQL API, and S3.', HEIGHT - 128, style=SMALL)
    flow(pdf, 'SIGN IN  /  OAuth authorization code', 616, [
        ('Browser', 'React application'),
        ('Cognito user pool', 'Managed sign-in / JWTs'),
        ('Google', 'OAuth identity provider'),
    ], bidirectional=(0, 1))
    flow(pdf, 'ASSIGN GROUP  /  Post Confirmation or Pre Token Generation', 532, [
        ('Cognito user pool', 'Users and Admins'),
        ('Group Lambda', 'Adds Users membership'),
        ('CloudWatch Logs', 'Group event and trigger'),
    ])
    flow(pdf, 'UPLOAD AND VIEW  /  IAM restricts S3 to the caller’s identity prefix', 448, [
        ('Cognito identity pool', 'Issues IAM credentials'),
        ('Browser', 'Signs S3 requests'),
        ('Amazon S3', 'Private image objects'),
    ])
    flow(pdf, 'CHECK SESSION  /  GET /session with a Cognito ID token', 364, [
        ('Browser', 'Account session panel'),
        ('API Gateway', 'Cognito authorizer'),
        ('Session Lambda', 'Groups and request ID'),
        ('CloudWatch Logs', 'Matching request ID'),
    ])
    flow(pdf, 'SAVE AND LIST CAPTIONS  /  GraphQL queries and mutations', 280, [
        ('Browser', 'Cognito user-pool JWT'),
        ('AWS AppSync', 'Owner-only GraphQL'),
        ('DynamoDB', 'Photo IDs and captions'),
    ])
    flow(pdf, 'DEPLOY  /  Push to main', 196, [
        ('GitHub', 'Source repository'),
        ('AWS Amplify', 'Build and host React'),
        ('CloudFormation', 'Deploy AWS resources'),
    ])
    paragraph(pdf, 'GitHub Actions runs five checks alongside Amplify. The Amplify deployment '
              'uses Systems Manager Parameter Store for Google secrets and S3 for build assets. AWS IAM '
              'grants execution and deployment permissions. The Amplify table manager uses '
              'AWS Step Functions and Lambda to provision DynamoDB.', 165, style=SMALL)
    page_footer(pdf)


def require_value(config, name):
    value = config.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f'Fill in {name} in the submission JSON.')
    return value.strip()


def https_url(config, name):
    value = require_value(config, name)
    url = urlsplit(value)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password
            or 'YOUR_' in value or any(char.isspace() for char in value)):
        raise ValueError(f'Enter the real HTTPS address for {name}.')
    if name == 'github_url' and (url.hostname != 'github.com' or len(url.path.strip('/').split('/')) < 2):
        raise ValueError('Enter the GitHub repository URL for github_url.')
    return value


def required_file(directory, value):
    path = directory / value
    if not path.is_file():
        raise ValueError(f'Missing file: {path}')
    return path


def link(pdf, name, url, y):
    text(pdf, name, MARGIN, y, size=10, font='Vera-Bold')
    y -= 16
    label = url if len(url) <= 90 else f'Open {name.lower()}'
    text(pdf, label, MARGIN, y, size=10, color=ACCENT)
    width = pdf.stringWidth(label, 'Vera', 10)
    pdf.linkURL(url, (MARGIN, y - 3, MARGIN + width, y + 11), relative=0)
    return y - 25


def evidence_page(pdf, student, title, file, links=()):
    page_header(pdf, title, student)
    y = HEIGHT - 135
    for label, url in links:
        y = link(pdf, label, url, y)
    image = ImageReader(str(file))
    image_width, image_height = image.getSize()
    scale = min(CONTENT / image_width, (y - 74) / image_height)
    shown_width = image_width * scale
    shown_height = image_height * scale
    x = MARGIN + (CONTENT - shown_width) / 2
    pdf.drawImage(image, x, y - shown_height, shown_width, shown_height, mask='auto')
    page_footer(pdf)


def findings_page(pdf, student, blocks):
    page_header(pdf, 'Findings and reflection', student)
    y = HEIGHT - 145
    for block in blocks:
        y = paragraph(pdf, block, y) - 13
    page_footer(pdf)


def submission(config_file):
    config = json.loads(config_file.read_text(encoding='utf-8-sig'))
    directory = config_file.parent
    name = require_value(config, 'student_name')
    roll = require_value(config, 'roll_number')
    if name == 'YOUR NAME' or roll == 'ROLLNUMBER' or not re.fullmatch(r'[A-Za-z0-9_-]+', roll):
        raise ValueError('Enter your real name and a roll number with letters, digits, hyphens or underscores.')
    student = f'{name}  /  {roll}'
    links = [
        ('GitHub repository', https_url(config, 'github_url')),
        ('Live application', https_url(config, 'live_url')),
    ]
    evidence = [
        ('Amplify deployment', 'amplify_screenshot'),
        ('GitHub Actions checks', 'ci_screenshot'),
        ('CloudWatch monitoring', 'cloudwatch_screenshot'),
    ]
    screenshots = [(title, required_file(directory, require_value(config, key)))
                   for title, key in evidence]
    for item in config.get('extra_evidence', []):
        screenshots.append((require_value(item, 'title'), required_file(directory, require_value(item, 'file'))))
    for _, screenshot in screenshots:
        ImageReader(str(screenshot)).getSize()

    reflections = required_file(directory, require_value(config, 'findings_file')).read_text(encoding='utf-8-sig').strip()
    if not reflections or reflections.startswith('[Replace the prompts'):
        raise ValueError('Replace the findings prompts with your own reflection.')
    blocks = re.split(r'\n\s*\n', reflections)

    output = Path(f'{roll}_FinalProject.pdf')
    pdf = Canvas(str(output), pagesize=A4)
    y = HEIGHT - 145
    for block in blocks:
        y = paragraph(pdf, block, y, draw=False) - 13
    if y < 55:
        raise ValueError('Shorten the findings so the reflection fits on one page.')

    pdf.setTitle(f'Luma Vault - {roll} Final Project')
    pdf.setAuthor(name)
    architecture(pdf, student)
    for index, (title, screenshot) in enumerate(screenshots):
        evidence_page(pdf, student, title, screenshot, links if index == 0 else ())
    findings_page(pdf, student, blocks)
    pdf.save()
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('config', nargs='?', type=Path, help='Path to completed submission.json')
    group.add_argument('--architecture-only', type=Path, help='Save a standalone architecture PDF')
    args = parser.parse_args()
    try:
        if args.architecture_only:
            pdf = Canvas(str(args.architecture_only), pagesize=A4)
            pdf.setTitle('Luma Vault - Architecture')
            architecture(pdf, 'Serverless photo journal')
            pdf.save()
            output = args.architecture_only
        else:
            output = submission(args.config)
    except (OSError, ValueError) as error:
        parser.exit(1, f'{error}\n')
    print(f'Created {output}')


if __name__ == '__main__':
    main()
