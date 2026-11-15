#!/usr/bin/env python3
"""Roda uma vez na raiz do projeto: python tools/preparar_assets.py
1) Renomeia assets/logos-bancos/* para minúsculas, sem espaço e sem acento (ex.: Itaú.png -> itau.png)
2) Renomeia assets/img/Whatsapp.png -> whatsapp.png
3) Gera icon-192, icon-512 e icon-maskable-512 a partir de assets/img/logo.png (precisa de: pip install pillow)
"""
import os, re, sys, unicodedata

def slug(nome):
    base, ext = os.path.splitext(nome)
    base = unicodedata.normalize('NFD', base)
    base = ''.join(c for c in base if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', base.lower()).strip('-') + ext.lower()

def renomear(pasta):
    if not os.path.isdir(pasta):
        print('Pasta não encontrada:', pasta); return
    for n in os.listdir(pasta):
        novo = slug(n)
        if novo != n:
            tmp = os.path.join(pasta, '__tmp__' + novo)
            os.rename(os.path.join(pasta, n), tmp)
            os.rename(tmp, os.path.join(pasta, novo))
            print('Renomeado:', n, '->', novo)

renomear('assets/logos-bancos')
renomear('assets/img')

try:
    from PIL import Image
except ImportError:
    sys.exit('Instale o Pillow para gerar os ícones: pip install pillow')

origem = 'assets/img/logo.png'
if not os.path.exists(origem):
    sys.exit('Não achei ' + origem)
logo = Image.open(origem).convert('RGBA')

def quadrado(tam, ocupa):
    fundo = Image.new('RGBA', (tam, tam), (255, 255, 255, 255))
    lado = int(tam * ocupa)
    img = logo.copy(); img.thumbnail((lado, lado), Image.LANCZOS)
    fundo.paste(img, ((tam - img.width) // 2, (tam - img.height) // 2), img)
    return fundo.convert('RGB')

quadrado(192, 0.9).save('assets/img/icon-192.png')
quadrado(512, 0.9).save('assets/img/icon-512.png')
quadrado(512, 0.62).save('assets/img/icon-maskable-512.png')  # margem de segurança do ícone adaptável
print('Ícones gerados em assets/img/')
